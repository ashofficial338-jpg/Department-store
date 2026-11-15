import mongoose from 'mongoose';
import env from './env.js';
import ApiError from '../utils/ApiError.js';

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
    connection = mongoose
      .connect(env.mongodbUri, mongoOptions(env.mongodbUri, { serverSelectionTimeoutMS: 10000 }))
      .then((conn) => {
        console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((err) => {
        connection = null; // allow the next request to retry
        console.error(`[db] MongoDB connection failed: ${err.message}`);
        throw new ApiError(
          503,
          `Cannot connect to the primary database (MongoDB Atlas): ${err.message} The app does not switch to local MongoDB automatically.`,
        );
      });
  }
  return connection;
}

export default connectDB;
