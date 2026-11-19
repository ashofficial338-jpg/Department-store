// Database backups and restore from a backup file.
//
// The app only ever talks to the primary database (Atlas, via MONGODB_URI); no other database is
// connected here. Jobs run only when an administrator starts them from Settings > Database Backup.
//
// Documents are copied through the raw driver as BSON, so ObjectIds, references, dates and timestamps
// arrive unchanged. Nothing in Atlas is deleted unless the administrator picks the "replace" mode.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { once } from 'events';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { describeUri, isAtlasUri } from '../config/db.js';
import MigrationRun from '../models/MigrationRun.js';
import ApiError from '../utils/ApiError.js';

const { EJSON } = mongoose.mongo.BSON;

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BACKUP_DIR = path.resolve(SERVER_ROOT, env.backupDir);
const BACKUP_FILE = /^[\w.-]+\.jsonl\.gz$/;
const INTERNAL_COLLECTIONS = new Set(['migrationruns']); // job history stays with the primary database
const BATCH = 1000;
const VERIFY_CHUNK = 5000;
const MAX_LOGS = 400;
const MAX_ISSUES = 300;
export const MODES = ['skip', 'overwrite', 'replace'];

let active = null; // the one job that may run at a time

// ---------- connections ----------

function primaryDb() {
  const { db } = mongoose.connection;
  if (!db) throw new ApiError(503, 'The primary database (MongoDB Atlas) is not connected.');
  return db;
}

function primaryInfo() {
  return { kind: isAtlasUri(env.mongodbUri) ? 'atlas' : 'other', ...describeUri(env.mongodbUri), database: mongoose.connection.name || describeUri(env.mongodbUri).database };
}

async function collectionCounts(db) {
  const list = await db.listCollections({}, { nameOnly: false }).toArray();
  const names = list
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.') && !INTERNAL_COLLECTIONS.has(c.name))
    .map((c) => c.name)
    .sort();
  return Promise.all(names.map(async (name) => ({ name, count: await db.collection(name).estimatedDocumentCount() })));
}

// ---------- status ----------

export async function getStatus() {
  const primary = { role: 'primary', ...primaryInfo(), ok: false, collections: [] };
  try {
    const db = primaryDb();
    await db.command({ ping: 1 });
    primary.collections = await collectionCounts(db);
    primary.ok = true;
  } catch (err) {
    primary.error = err.message;
  }

  return { primary, canTransfer: !env.isServerless, active: active ? snapshot(active) : null };
}

// ---------- job bookkeeping ----------

function totalsOf(job) {
  const t = { total: 0, processed: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0, deleted: 0, missing: 0 };
  for (const it of job.items) {
    t.total += it.sourceCount || 0;
    for (const k of ['processed', 'inserted', 'updated', 'skipped', 'duplicates', 'failed', 'deleted']) t[k] += it[k] || 0;
    t.missing += it.verified?.missing || 0;
  }
  return t;
}

function snapshot(job) {
  return { ...job, _id: job.id, totals: totalsOf(job) };
}

function log(job, message, level = 'info') {
  job.logs.push({ at: new Date(), level, message });
  if (job.logs.length > MAX_LOGS) job.logs.splice(0, job.logs.length - MAX_LOGS);
}

function issue(job, entry) {
  if (job.issues.length < MAX_ISSUES) job.issues.push(entry);
  else job.issuesDropped = (job.issuesDropped || 0) + 1;
}

async function persist(job) {
  const { id, ...fields } = snapshot(job);
  delete fields._id;
  await MigrationRun.updateOne({ _id: id }, { $set: fields });
}

const newItem = (name, sourceCount = 0) => ({
  name, sourceCount, destBefore: null, destAfter: null, processed: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0, deleted: 0, verified: null, status: 'pending',
});

function requireIdle() {
  if (env.isServerless) {
    throw new ApiError(400, 'Backups and restores run only when the server runs on your own computer: the hosted site cannot write backup files.');
  }
  if (active) throw new ApiError(409, 'Another database job is already running. Wait for it to finish.');
}

async function startJob({ type, mode, source, destination, items, user }, work) {
  const doc = await MigrationRun.create({
    type, mode, source, destination, items, status: 'running', phase: 'starting', startedBy: user?._id, startedByName: user?.name, startedAt: new Date(),
  });
  const job = {
    id: String(doc._id), type, mode, source, destination, items, status: 'running', phase: 'starting', backupFile: null,
    logs: [], issues: [], error: null, startedByName: user?.name, startedAt: doc.startedAt, finishedAt: null,
  };
  active = job;
  const timer = setInterval(() => persist(job).catch(() => {}), 1500);

  (async () => {
    try {
      await work(job);
      const t = totalsOf(job);
      const unexplained = job.items.some((it) => it.status === 'warning');
      job.status = t.failed || unexplained ? 'completed_with_errors' : 'completed';
      if (job.type !== 'backup') log(job, `Finished: ${t.inserted} inserted, ${t.updated} overwritten, ${t.skipped + t.duplicates} skipped, ${t.failed} failed.`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      log(job, `Job failed: ${err.message}`, 'error');
      console.error('[db-transfer] job failed:', err);
    } finally {
      clearInterval(timer);
      job.phase = 'done';
      job.finishedAt = new Date();
      await persist(job).catch((err) => console.error('[db-transfer] could not save the job report:', err.message));
      active = null;
    }
  })();

  return snapshot(job);
}

export async function listRuns() {
  // A job still marked "running" that this process does not own was cut off by a restart.
  await MigrationRun.updateMany(
    { status: 'running', ...(active ? { _id: { $ne: active.id } } : {}) },
    { $set: { status: 'interrupted', phase: 'done', error: 'The server stopped before this job finished.', finishedAt: new Date() } },
  );
  return MigrationRun.find().select('-logs -issues').sort({ startedAt: -1 }).limit(50).lean();
}

export async function getRun(id) {
  if (active && active.id === String(id)) return snapshot(active);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid job id.');
  const run = await MigrationRun.findById(id).lean();
  if (!run) throw new ApiError(404, 'Job not found.');
  return run;
}

// ---------- backup files ----------

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

export function backupPath(name) {
  if (typeof name !== 'string' || !BACKUP_FILE.test(name) || name.includes('..')) throw new ApiError(400, 'Invalid backup file name.');
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) throw new ApiError(404, 'Backup file not found.');
  return file;
}

// First line of a backup file: where it came from and what it contains. Null when it is not one of ours.
export async function readHeader(file) {
  const input = fs.createReadStream(file);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({ input: input.pipe(gunzip), crlfDelay: Infinity });
  input.on('error', () => rl.close());
  gunzip.on('error', () => rl.close());
  try {
    for await (const line of rl) {
      const header = JSON.parse(line);
      return header.type === 'header' && header.format === 'aurelia-backup' ? header : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    rl.close();
    input.destroy();
  }
}

export async function listBackups() {
  if (env.isServerless || !fs.existsSync(BACKUP_DIR)) return [];
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => BACKUP_FILE.test(f));
  const rows = await Promise.all(
    files.map(async (name) => {
      const file = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(file);
      const header = await readHeader(file);
      return {
        name,
        size: stat.size,
        createdAt: header?.createdAt || stat.mtime,
        valid: !!header,
        kind: header?.kind || null,
        host: header?.host || null,
        database: header?.database || null,
        reason: header?.reason || null,
        collections: header?.collections || [],
        documents: (header?.collections || []).reduce((s, c) => s + (c.count || 0), 0),
      };
    }),
  );
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Streams the given collections of a database into one gzipped JSON-lines file (Extended JSON, so
// every BSON type survives a round trip). Index definitions are stored alongside each collection.
async function writeBackup({ db, info, names, reason, onCollection, onBatch }) {
  ensureBackupDir();
  const name = `${info.kind}-${info.database}-${stamp()}${reason ? `-${reason}` : ''}.jsonl.gz`;
  const file = path.join(BACKUP_DIR, name);
  const tmp = `${file}.part`;
  const gzip = zlib.createGzip();
  const out = fs.createWriteStream(tmp);
  gzip.pipe(out);
  const write = async (line) => {
    if (!gzip.write(`${line}\n`)) await once(gzip, 'drain');
  };

  let documents = 0;
  try {
    const collections = await Promise.all(names.map(async (n) => ({ name: n, count: await db.collection(n).estimatedDocumentCount() })));
    await write(JSON.stringify({ type: 'header', format: 'aurelia-backup', version: 1, ...info, reason: reason || 'manual', createdAt: new Date(), collections }));
    for (const n of names) {
      const col = db.collection(n);
      const indexes = await col.indexes().catch(() => []);
      await write(JSON.stringify({ type: 'collection', name: n, indexes }));
      onCollection?.(n);
      let pending = 0;
      for await (const doc of col.find({}, { batchSize: BATCH })) {
        await write(EJSON.stringify({ type: 'doc', c: n, d: doc }, { relaxed: false }));
        documents += 1;
        pending += 1;
        if (pending >= BATCH) {
          onBatch?.(n, pending);
          pending = 0;
        }
      }
      if (pending) onBatch?.(n, pending);
    }
    gzip.end();
    await once(out, 'finish');
    fs.renameSync(tmp, file);
  } catch (err) {
    gzip.destroy();
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { name, file, documents, size: fs.statSync(file).size };
}

// ---------- sources ----------

async function* fileEvents(file, wanted) {
  const input = fs.createReadStream(file);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({ input: input.pipe(gunzip), crlfDelay: Infinity });
  let streamError = null;
  const fail = (err) => {
    streamError = err;
    rl.close();
  };
  input.on('error', fail);
  gunzip.on('error', fail);

  let current = null;
  let take = false;
  let batch = [];
  try {
    for await (const line of rl) {
      if (!line) continue;
      if (line.startsWith('{"type":"doc"')) {
        if (!take) continue;
        batch.push(EJSON.parse(line, { relaxed: false }).d);
        if (batch.length >= BATCH) {
          yield { type: 'docs', name: current, docs: batch };
          batch = [];
        }
        continue;
      }
      const meta = JSON.parse(line);
      if (meta.type !== 'collection') continue;
      if (batch.length) {
        yield { type: 'docs', name: current, docs: batch };
        batch = [];
      }
      current = meta.name;
      take = !INTERNAL_COLLECTIONS.has(current) && (!wanted || wanted.has(current));
      if (take) yield { type: 'collection', name: current, indexes: meta.indexes || [] };
    }
    if (batch.length) yield { type: 'docs', name: current, docs: batch };
  } finally {
    rl.close();
    input.destroy();
  }
  if (streamError) throw new Error(`The backup file could not be read: ${streamError.message}`);
}

// ---------- copying ----------

// Recreates the source collection's indexes on the destination (unique ones included, which is what
// stops duplicate business keys). An index that cannot be built is reported, not fatal.
async function copyIndexes(col, indexes, job) {
  for (const ix of indexes) {
    if (ix.name === '_id_') continue;
    const { v, key, ns, background, textIndexVersion, weights, ...options } = ix;
    let spec = key;
    if (key && key._fts === 'text') {
      spec = {};
      for (const [field, dir] of Object.entries(key)) if (field !== '_fts' && field !== '_ftsx') spec[field] = dir;
      for (const field of Object.keys(weights || {})) spec[field] = 'text';
      options.weights = weights;
    }
    try {
      await col.createIndex(spec, options);
    } catch (err) {
      log(job, `${col.collectionName}: index "${ix.name}" was not created - ${err.message}`, 'warn');
    }
  }
}

const isIdDuplicate = (we) => we.code === 11000 && /index: _id_(\s|$)/.test(we.errmsg || '');

async function applyBatch(col, docs, mode, item, job) {
  const ops = mode === 'overwrite'
    ? docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } }))
    : docs.map((d) => ({ insertOne: { document: d } }));
  const count = (r) => {
    if (!r) return;
    if (mode === 'overwrite') {
      item.inserted += r.upsertedCount || 0;
      item.updated += r.matchedCount || 0;
    } else {
      item.inserted += r.insertedCount || 0;
    }
  };

  try {
    count(await col.bulkWrite(ops, { ordered: false }));
  } catch (err) {
    const writeErrors = [].concat(err.writeErrors || []);
    if (!writeErrors.length) {
      item.failed += docs.length;
      issue(job, { collection: item.name, kind: 'failed', message: err.message });
      throw err; // connection-level failure: stop rather than plough through every batch
    }
    count(err.result);
    for (const we of writeErrors) {
      const id = docs[we.index]?._id;
      if (isIdDuplicate(we)) {
        item.skipped += 1; // already in the destination with the same _id
      } else if (we.code === 11000) {
        item.duplicates += 1; // another record already holds this unique key (e.g. same email / SKU)
        issue(job, { collection: item.name, _id: String(id), kind: 'duplicate', message: (we.errmsg || '').replace(/^E11000 duplicate key error collection: \S+ /, 'Duplicate of an existing record - ') });
      } else {
        item.failed += 1;
        issue(job, { collection: item.name, _id: String(id), kind: 'failed', message: we.errmsg || 'Write failed' });
      }
    }
  }
}

// Backup -> transfer -> verification of a restore from a backup file.
async function runTransfer(job, events, mode) {
  const dest = primaryDb();
  const itemOf = (name) => {
    let it = job.items.find((i) => i.name === name);
    if (!it) {
      it = newItem(name);
      job.items.push(it);
    }
    return it;
  };

  // 1. Backup of the Atlas collections this job can touch.
  job.phase = 'backup';
  const existing = new Set((await collectionCounts(dest)).filter((c) => c.count > 0).map((c) => c.name));
  for (const it of job.items) it.destBefore = existing.has(it.name) ? await dest.collection(it.name).countDocuments() : 0;
  const toBackup = job.items.filter((it) => it.destBefore > 0).map((it) => it.name);
  if (toBackup.length) {
    log(job, `Backing up ${toBackup.length} Atlas collection(s) before making changes...`);
    const backup = await writeBackup({ db: dest, info: primaryInfo(), names: toBackup, reason: `before-${job.type}` });
    job.backupFile = backup.name;
    log(job, `Backup saved: ${backup.name} (${backup.documents} documents).`);
  } else {
    log(job, 'The selected Atlas collections are empty - there is nothing to back up.');
  }

  // 2. Transfer.
  job.phase = 'transfer';
  const ids = new Map();
  let item = null;
  let col = null;
  const close = () => {
    if (item && item.status === 'running') item.status = 'transferred';
  };
  for await (const ev of events) {
    if (ev.type === 'collection') {
      close();
      item = itemOf(ev.name);
      item.status = 'running';
      col = dest.collection(ev.name);
      ids.set(ev.name, []);
      if (mode === 'replace' && item.destBefore > 0) {
        const r = await col.deleteMany({});
        item.deleted = r.deletedCount;
        log(job, `${ev.name}: removed ${r.deletedCount} existing Atlas document(s) (replace mode, backed up above).`, 'warn');
      }
      await copyIndexes(col, ev.indexes, job);
      log(job, `${ev.name}: transferring...`);
    } else {
      await applyBatch(col, ev.docs, mode, item, job);
      item.processed += ev.docs.length;
      if (item.processed > item.sourceCount) item.sourceCount = item.processed;
      ids.get(ev.name).push(...ev.docs.map((d) => d._id));
    }
  }
  close();

  // 3. Verification: every source _id must now exist in Atlas (apart from reported duplicates).
  job.phase = 'verify';
  for (const it of job.items) {
    const list = ids.get(it.name) || [];
    const c = dest.collection(it.name);
    let present = 0;
    for (let i = 0; i < list.length; i += VERIFY_CHUNK) {
      present += await c.countDocuments({ _id: { $in: list.slice(i, i + VERIFY_CHUNK) } });
    }
    it.sourceCount = list.length;
    it.verified = { present, missing: list.length - present };
    it.destAfter = list.length || it.destBefore ? await c.countDocuments() : 0;
    const unexplained = it.verified.missing - it.duplicates - it.failed;
    it.status = it.failed || unexplained > 0 ? 'warning' : 'done';
    log(
      job,
      `${it.name}: ${it.inserted} inserted, ${it.updated} overwritten, ${it.skipped} already present, ${it.duplicates} duplicate key, ${it.failed} failed - verified ${present}/${list.length} in Atlas.`,
      it.status === 'warning' ? 'warn' : 'info',
    );
  }
}

function requireMode(mode, confirm) {
  if (!MODES.includes(mode)) throw new ApiError(400, `Mode must be one of: ${MODES.join(', ')}.`);
  if (mode === 'overwrite' && confirm !== 'OVERWRITE') throw new ApiError(400, 'Overwriting existing Atlas records needs confirmation: type OVERWRITE.');
  if (mode === 'replace' && confirm !== 'REPLACE') throw new ApiError(400, 'Replacing Atlas collections needs confirmation: type REPLACE.');
}

function pick(available, requested) {
  if (!Array.isArray(requested) || !requested.length) return available;
  const want = new Set(requested.map(String));
  return available.filter((c) => want.has(c.name));
}

// ---------- public jobs ----------

export async function startRestore({ file, collections, mode = 'skip', confirm, user }) {
  requireIdle();
  requireMode(mode, confirm);
  const full = backupPath(file);
  const header = await readHeader(full);
  if (!header) throw new ApiError(400, 'That file is not a valid ARKA MART database backup.');
  const chosen = pick((header.collections || []).filter((c) => !INTERNAL_COLLECTIONS.has(c.name)), collections);
  if (!chosen.length) throw new ApiError(400, 'None of the selected collections are in that backup.');
  const wanted = new Set(chosen.map((c) => c.name));
  return startJob(
    {
      type: 'restore', mode, source: { kind: 'file', file, host: header.host, database: header.database, backupOf: header.kind },
      destination: primaryInfo(), items: chosen.map((c) => newItem(c.name, c.count)), user,
    },
    async (job) => {
      log(job, `Restore started: ${wanted.size} collection(s) from ${file} to ${job.destination.host}/${job.destination.database}, mode "${mode}".`);
      await runTransfer(job, fileEvents(full, wanted), mode);
    },
  );
}

export async function startBackup({ collections, user }) {
  requireIdle();
  const db = primaryDb();
  const info = primaryInfo();
  const chosen = pick(await collectionCounts(db), collections);
  if (!chosen.length) throw new ApiError(400, 'There are no collections to back up.');
  return startJob(
    { type: 'backup', source: info, destination: { kind: 'file' }, items: chosen.map((c) => newItem(c.name, c.count)), user },
    async (job) => {
      job.phase = 'backup';
      log(job, `Backup started: ${chosen.length} collection(s) from ${info.host}/${info.database}.`);
      const itemOf = (n) => job.items.find((i) => i.name === n);
      const backup = await writeBackup({
        db, info, names: chosen.map((c) => c.name),
        onCollection: (n) => { itemOf(n).status = 'running'; },
        onBatch: (n, count) => { itemOf(n).processed += count; },
      });
      for (const it of job.items) {
        it.sourceCount = it.processed;
        it.status = 'done';
      }
      job.backupFile = backup.name;
      job.destination = { kind: 'file', file: backup.name, size: backup.size };
      log(job, `Backup saved: ${backup.name} (${backup.documents} documents).`);
    },
  );
}

// Immediate full backup of the primary database (used by maintenance scripts before they change data).
export async function backupAllNow(reason) {
  const db = primaryDb();
  const names = (await collectionCounts(db)).map((c) => c.name);
  return writeBackup({ db, info: primaryInfo(), names, reason, onCollection: () => {}, onBatch: () => {} });
}

export default { getStatus, listRuns, getRun, listBackups, startRestore, startBackup, backupPath, readHeader, ensureBackupDir, BACKUP_DIR, MODES };
