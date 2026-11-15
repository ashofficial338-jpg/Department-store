import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

import env from './config/env.js';
import connectDB from './config/db.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);
app.use(compression());

// Single-service hosting (Render): serve the built client the way Vercel's static hosting does —
// hashed bundles cached long-term, every other non-API route falls back to index.html.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const clientIndex = path.join(clientDist, 'index.html');
if (env.serveClient && fs.existsSync(clientIndex)) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get(/^\/(?!(api|uploads|assets)(\/|$))/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(clientIndex);
  });
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.clientUrl, credentials: true }));
// Report exports carry chart images rendered in the browser, so that one route accepts a larger body.
const jsonDefault = express.json({ limit: '2mb' });
const jsonLarge = express.json({ limit: '12mb' });
app.use((req, res, next) => (req.path === '/api/reports/advanced/export' ? jsonLarge : jsonDefault)(req, res, next));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.use('/uploads', express.static(path.join(__dirname, env.uploadDir)));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', env: env.nodeEnv, commit: env.commit }));

// Ensure the database is connected before any API route runs.
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});
app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
