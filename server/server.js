import env from './config/env.js';
import connectDB from './config/db.js';
import app from './app.js';

try {
  await connectDB();
} catch {
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`[server] AURELIA API running on port ${env.port} (${env.nodeEnv})`);
});
