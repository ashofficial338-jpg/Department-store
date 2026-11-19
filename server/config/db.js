import mongoose from 'mongoose';
import env from './env.js';
import ApiError from '../utils/ApiError.js';

// Forms send an unselected optional dropdown (brand, subcategory, supplier, store...) as "". Store that
// as "not set" (null) instead of failing with "Invalid identifier supplied."; real bad ids still fail.
const castObjectId = mongoose.Schema.Types.ObjectId.cast();
mongoose.Schema.Types.ObjectId.cast((v) => (v === '' ? null : castObjectId(v)));

const URI_PARTS = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/i;
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// Host and database of a connection string, without the credentials.
export function describeUri(uri) {
  const m = URI_PARTS.exec(uri || '');
  if (!m) return { host: null, database: null };
  return { host: m[1], database: m[2] || env.mongodbDb };
}

export const isAtlasUri = (uri) => /^mongodb\+srv:\/\//i.test(uri || '') || /\.mongodb\.net/i.test(uri || '');

export function isLocalUri(uri) {
  const { host } = describeUri(uri);
  return !!host && host.split(',').every((h) => LOCAL_HOSTS.test(h));
}

// A connection string without a database name would otherwise land in MongoDB's "test" database.
export function mongoOptions(uri, extra = {}) {
  const m = URI_PARTS.exec(uri || '');
  return { ...(m && !m[2] ? { dbName: env.mongodbDb } : {}), ...extra };
}

// Why the primary database cannot be used as configured, or null when the configuration is fine.
export function primaryConfigProblem() {
  if (!env.mongodbUri) {
    return 'MONGODB_URI is not set. Set it to your MongoDB Atlas connection string — the app does not fall back to a local database.';
  }
  // Automated tests run against a throwaway local QA database; everything else must use Atlas.
  if (isLocalUri(env.mongodbUri) && env.nodeEnv !== 'test') {
    return 'MONGODB_URI points to a local MongoDB. MongoDB Atlas is the only database this app connects to; set MONGODB_URI to your Atlas connection string.';
  }
  return null;
}

// Turns a driver error into a likely cause and the fix, so the log says what to do next.
export function diagnoseConnectionError(err) {
  const msg = `${err?.message || ''} ${err?.cause?.message || ''}`;
  const code = err?.code || err?.cause?.code;
  if (/bad auth|authentication failed|auth.*fail/i.test(msg) || code === 18 || code === 8000) {
    return 'Authentication failed: check the username/password in MONGODB_URI (Atlas > Database Access). URL-encode special characters in the password (@ : / ? # %).';
  }
  if (/ENOTFOUND|querySrv|ESERVFAIL|ECONNREFUSED.*_mongodb/i.test(msg)) {
    return 'DNS lookup of the Atlas host failed: check the cluster host in MONGODB_URI and this machine\'s internet/DNS (some networks block SRV lookups).';
  }
  if (/whitelist|IP address|Could not connect to any servers|ReplicaSetNoPrimary|Server selection timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) {
    return env.isServerless
      ? 'Atlas refused this host. Vercel functions have changing IPs: add 0.0.0.0/0 in Atlas > Network Access (the password still protects the database). Also confirm the cluster is not paused.'
      : 'Atlas refused this host. Add this machine\'s current public IP in Atlas > Network Access (home/mobile IPs change - re-add it when it does). Also confirm the cluster is not paused.';
  }
  return 'Check MONGODB_URI, Atlas > Network Access, and that the cluster is running.';
}

let listenersAttached = false;
function attachConnectionLogs() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB Atlas disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB Atlas reconnected'));
  mongoose.connection.on('error', (err) => console.error(`[db] MongoDB Atlas error: ${err.message}`));
}

// Cached across invocations so serverless functions (Vercel) reuse one connection.
let connection = null;

export function connectDB() {
  if (!connection) {
    const problem = primaryConfigProblem();
    if (problem) {
      console.error(`[db] ${problem}`);
      return Promise.reject(new ApiError(503, problem));
    }
    mongoose.set('strictQuery', true);
    attachConnectionLogs();
    const { host, database } = describeUri(env.mongodbUri);
    const started = Date.now();
    console.log(`[db] Connecting to MongoDB Atlas ${host}/${database} ...`);
    connection = mongoose
      .connect(env.mongodbUri, mongoOptions(env.mongodbUri, { serverSelectionTimeoutMS: 10000 }))
      .then((conn) => {
        console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name} (${Date.now() - started} ms)`);
        return conn;
      })
      .catch((err) => {
        connection = null; // allow the next request to retry
        const hint = diagnoseConnectionError(err);
        console.error(`[db] MongoDB connection failed after ${Date.now() - started} ms: ${err.name}: ${err.message}`);
        console.error(`[db] Likely fix: ${hint}`);
        throw new ApiError(
          503,
          `Cannot connect to the primary database (MongoDB Atlas): ${err.message} ${hint} The app does not switch to local MongoDB automatically.`,
        );
      });
  }
  return connection;
}

export default connectDB;
