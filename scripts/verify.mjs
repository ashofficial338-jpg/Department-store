// Pre-deploy validation: the same checks run locally (by auto-deploy) and in GitHub Actions.
// Any failure exits non-zero so a broken change is never pushed / never marked green.
//
// Usage:  node scripts/verify.mjs            (all checks)
//         node scripts/verify.mjs client     (only client checks)
//         node scripts/verify.mjs server     (only server checks)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];

const checks = [
  { area: 'client', name: 'Client lint', cwd: 'client', cmd: 'npm run lint' },
  { area: 'client', name: 'Client production build', cwd: 'client', cmd: 'npm run build' },
  {
    area: 'server',
    name: 'Server loads (syntax + imports)',
    cwd: 'server',
    cmd: 'node -e "import(\'./app.js\').then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })"',
    env: { NODE_ENV: 'test', JWT_SECRET: 'verify_only', MONGODB_URI: 'mongodb://127.0.0.1:1/verify_test' },
  },
  { area: 'server', name: 'Server unit tests (GST)', cwd: 'server', cmd: 'node --test tests/gst.test.js' },
  { area: 'server', name: 'Serverless entry loads', cwd: '.', cmd: 'node --check api/index.js' },
];

let failed = 0;
for (const c of checks) {
  if (only && c.area !== only) continue;
  process.stdout.write(`• ${c.name} ... `);
  const started = Date.now();
  const r = spawnSync(c.cmd, {
    cwd: path.join(ROOT, c.cwd),
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...(c.env || {}) },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`ok (${secs}s)`);
  } else {
    failed++;
    console.log(`FAILED (${secs}s)`);
    console.log(`${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-40).join('\n'));
  }
}

if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
