import mongoose from 'mongoose';
import env from './env.js';

// Cached across invocations so serverless functions (Vercel) reuse one connection.
let connection = null;

export function connectDB() {
  if (!connection) {
    mongoose.set('strictQuery', true);
    connection = mongoose
      .connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 })
      .then((conn) => {
        console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((err) => {
        connection = null; // allow the next request to retry
        console.error(`[db] MongoDB connection failed: ${err.message}`);
        throw err;
      });
  }
  return connection;
}

export default connectDB;
