// Post-deploy smoke test against the live site: pages, static assets, API, and database connectivity.
//
// Usage:  node scripts/smoke-test.mjs [vercel|render|baseUrl]
// Default is the Vercel production URL (see deploy.config.json).

import { resolveUrl, summarize } from './deploy-targets.mjs';

const BASE = resolveUrl(process.argv[2] || process.env.SMOKE_URL);
const ATTEMPTS = 3;

const results = [];

async function check(name, fn) {
  let lastErr;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
      return;
    } catch (err) {
      lastErr = err;
      if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  results.push({ name, ok: false });
  console.log(`  ✗ ${name}: ${lastErr.message}`);
}

async function get(p, init) {
  const res = await fetch(`${BASE}${p}`, { redirect: 'follow', ...init });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json };
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`Smoke testing ${BASE}`);

let html = '';
await check('Home page loads', async () => {
  const r = await get('/');
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(r.text.includes('id="root"'), 'app root element missing');
  html = r.text;
});

await check('Deep links resolve to the app (SPA routing)', async () => {
  for (const route of ['/login', '/pos', '/products', '/reports']) {
    const r = await get(route);
    expect(r.status === 200 && r.text.includes('id="root"'), `${route} -> HTTP ${r.status}`);
  }
});

await check('JS and CSS bundles are served', async () => {
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  expect(assets.length > 0, 'no bundles referenced in index.html');
  for (const a of assets) {
    const r = await get(a);
    expect(r.status === 200, `${a} -> HTTP ${r.status}`);
  }
});

await check('API health endpoint', async () => {
  const r = await get('/api/health');
  expect(r.status === 200 && r.json?.status === 'ok', `HTTP ${r.status} ${r.text.slice(0, 120)}`);
});

await check('Database reachable (login lookup)', async () => {
  // A non-existent user must be rejected with 401; a DB/config failure would return 5xx.
  const r = await get('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke-test@invalid.example', password: 'not-a-real-password' }),
  });
  expect(r.status === 401 || r.status === 429, `HTTP ${r.status} ${r.text.slice(0, 120)}`);
});

await check('Protected API rejects anonymous access', async () => {
  for (const p of ['/api/products', '/api/reports/sales']) {
    const r = await get(p);
    expect(r.status === 401, `${p} -> HTTP ${r.status}`);
  }
});

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} smoke check(s) FAILED.` : '\nAll smoke checks passed.');
summarize(failed ? `- ❌ ${BASE} failed ${failed} smoke check(s)` : `- ✅ Live: ${BASE}`);
process.exit(failed ? 1 : 0);
