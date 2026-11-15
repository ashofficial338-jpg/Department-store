import env from './config/env.js';
import connectDB from './config/db.js';
import app from './app.js';

// Keep serving when Atlas is unreachable: every API request then answers 503 with the connection
// error (and retries the connection) rather than the app quietly running on another database.
connectDB().catch(() => {
  console.error('[server] Started without a database connection - API requests return 503 until MongoDB Atlas is reachable.');
});

app.listen(env.port, () => {
  console.log(`[server] AURELIA API running on port ${env.port} (${env.nodeEnv})`);
});
