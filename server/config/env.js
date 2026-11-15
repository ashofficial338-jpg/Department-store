import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Primary database: MongoDB Atlas. There is deliberately no local default — if this is missing or
  // unreachable the API reports a connection error instead of switching to a local database.
  mongodbUri: process.env.MONGODB_URI || '',
  // Database name used when the connection string does not include one.
  mongodbDb: process.env.MONGODB_DB || 'department_store',
  // Where database backups are written (relative to server/). Not available on serverless hosts.
  backupDir: process.env.BACKUP_DIR || 'backups',
  isServerless: Boolean(process.env.VERCEL),
  // Never fall back to the insecure dev secret on Vercel; logins fail until JWT_SECRET is set.
  jwtSecret: process.env.JWT_SECRET || (process.env.VERCEL ? undefined : 'dev_only_insecure_secret_change_me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),
};

export default env;
