// Waits until a deployment is serving a given commit (reads `commit` from /api/health).
//
// Usage:  node scripts/wait-for-deploy.mjs <vercel|render|url> [commitSha] [timeoutMinutes]
// Exit codes:  0 = that commit is live   1 = timed out   2 = nothing is deployed at that URL yet

import { execSync } from 'node:child_process';
import { resolveUrl, summarize } from './deploy-targets.mjs';

const BASE = resolveUrl(process.argv[2]);
const SHA = process.argv[3] || execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const TIMEOUT_MS = Number(process.argv[4] || 15) * 60 * 1000;
const started = Date.now();
const short = SHA.slice(0, 7);

// The result is returned through process.exitCode (not process.exit) so open sockets close cleanly.
async function waitUntilLive() {
  console.log(`Waiting for ${BASE} to serve ${short}...`);
  let last = '';
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(60000), headers: { Connection: 'close' } });
      const body = await res.json().catch(() => null);
      // Render answers 404 with this header when no service exists at the hostname.
      if (res.headers.get('x-render-routing') === 'no-server') {
        console.log(`Nothing is deployed at ${BASE} yet. Create the service first (see README, "Continuous Deployment").`);
        summarize(`- ⚠️ ${BASE} is not set up yet`);
        return 2;
      }
      if (body?.commit === SHA) {
        console.log(`${BASE} is serving ${short}.`);
        return 0;
      }
      const now = body?.commit ? `serving ${body.commit.slice(0, 7)}` : `HTTP ${res.status}`;
      if (now !== last) console.log(`  still ${now}`);
      last = now;
    } catch (err) {
      if (err.message !== last) console.log(`  not reachable yet: ${err.message}`);
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log(`Timed out: ${BASE} is not serving ${short} (last seen: ${last || 'no response'}).`);
  summarize(`- ❌ ${BASE} did not pick up \`${short}\``);
  return 1;
}

process.exitCode = await waitUntilLive();
