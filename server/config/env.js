import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/department_store',
  // Never fall back to the insecure dev secret on a host; logins fail until JWT_SECRET is set.
  jwtSecret:
    process.env.JWT_SECRET || (process.env.VERCEL || process.env.RENDER ? undefined : 'dev_only_insecure_secret_change_me'),
  // On Render one service runs the API and serves the built client (Vercel serves the client itself).
  serveClient: Boolean(process.env.RENDER) || process.env.SERVE_CLIENT === 'true',
  // Commit this deployment was built from; reported by /api/health so deploys can be verified.
  commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),
};

export default env;
