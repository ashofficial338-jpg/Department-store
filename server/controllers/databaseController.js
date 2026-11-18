import fs from 'fs';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import recordAudit from '../utils/audit.js';
import {
  getStatus, listRuns, getRun, listBackups, startRestore, startBackup, backupPath, readHeader,
} from '../services/dbTransfer.js';

export const status = catchAsync(async (req, res) => {
  res.json({ success: true, data: await getStatus() });
});

export const runs = catchAsync(async (req, res) => {
  res.json({ success: true, data: await listRuns() });
});

export const run = catchAsync(async (req, res) => {
  res.json({ success: true, data: await getRun(req.params.id) });
});

export const backups = catchAsync(async (req, res) => {
  res.json({ success: true, data: await listBackups() });
});

export const restore = catchAsync(async (req, res) => {
  const { file, collections, mode, confirm } = req.body;
  const job = await startRestore({ file, collections, mode, confirm, user: req.user });
  recordAudit({ req, action: 'database.restore', entity: 'Database', newValue: { file, mode: job.mode, collections: job.items.map((i) => i.name) } });
  res.status(202).json({ success: true, data: job });
});

export const createBackup = catchAsync(async (req, res) => {
  const { collections } = req.body;
  const job = await startBackup({ collections, user: req.user });
  recordAudit({ req, action: 'database.backup', entity: 'Database', newValue: { database: 'atlas', collections: job.items.map((i) => i.name) } });
  res.status(202).json({ success: true, data: job });
});

export const downloadBackup = catchAsync(async (req, res) => {
  const file = backupPath(req.params.name);
  recordAudit({ req, action: 'database.export', entity: 'Database', newValue: { file: req.params.name } });
  res.download(file, req.params.name);
});

// Import: the uploaded file is stored with the other backups and can then be restored into Atlas.
export const uploadBackup = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a backup file (.jsonl.gz) to import.');
  const header = await readHeader(req.file.path);
  if (!header) {
    fs.rmSync(req.file.path, { force: true });
    throw new ApiError(400, 'That file is not a valid ARKA MART database backup.');
  }
  recordAudit({ req, action: 'database.import', entity: 'Database', newValue: { file: req.file.filename } });
  res.status(201).json({ success: true, data: { name: req.file.filename } });
});
