// Continuous deployment watcher.
//
//   file change → validate (lint/build/tests) → commit → push to GitHub
//   → Vercel builds & promotes to https://aurelia-department-store.vercel.app → live smoke test
//
// Vercel's GitHub integration deploys every push to `main` to the same production URL, and only
// promotes a deployment once its build succeeds, so the live URL never points at a broken build.
//
// Usage (from the project root):  npm run deploy:watch     (or double-click auto-deploy.bat)
// Options:  --once   validate + commit + push whatever is pending, wait for the deploy, then exit
// Stop with Ctrl+C.

import { watch } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { TARGETS } from './deploy-targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'ashofficial338-jpg/Department-store';
const BRANCH = 'main';
const PROD_URL = TARGETS.vercel;
const RENDER_URL = TARGETS.render;
const DEBOUNCE_MS = 8000; // wait for edits to settle before deploying
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const ONCE = process.argv.includes('--once');
const IGNORED = ['.git', 'node_modules', 'dist', 'build', 'uploads', '.vercel', '.vscode', '.idea', 'coverage'];

let timer = null;
let running = false;
let pending = false;

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
const git = (args) => sh(`git ${args}`);
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isIgnored(file) {
  if (!file) return true;
  const parts = file.split(/[\\/]/);
  return parts.some(
    (p) => IGNORED.includes(p) || p.startsWith('.env') || p.endsWith('~') || p.endsWith('.swp') || p.endsWith('.tmp'),
  );
}

// ---------- commit message ----------

function describe(file) {
  const f = file.replace(/\\/g, '/');
  const base = path.basename(f).replace(/\.(jsx?|tsx?|mjs|css|json|md)$/, '');
  let m;
  if ((m = f.match(/^client\/src\/pages\/(?:.*\/)?([^/]+)\.\w+$/))) return `${m[1]} page`;
  if ((m = f.match(/^client\/src\/components\/(?:.*\/)?([^/]+)\.\w+$/))) return `${m[1]} component`;
  if (/^client\/src\/.*\.css$/.test(f)) return 'styles';
  if (/^client\/src\/(api|services)\//.test(f)) return 'client API layer';
  if ((m = f.match(/^server\/routes\/([^/]+)\.js$/))) return `${base.replace(/Routes?$/i, '')} routes`;
  if ((m = f.match(/^server\/controllers\/([^/]+)\.js$/))) return `${base.replace(/Controller$/i, '')} API`;
  if ((m = f.match(/^server\/models\/([^/]+)\.js$/))) return `${base} model`;
  if (/^server\/tests\//.test(f)) return 'tests';
  if (/^server\/seed\//.test(f)) return 'seed data';
  if (/(^|\/)package(-lock)?\.json$/.test(f)) return 'dependencies';
  if (/^(vercel\.json|\.github\/|scripts\/)/.test(f)) return 'deployment tooling';
  if (/\.md$/.test(f)) return 'docs';
  return base;
}

function commitMessage(entries) {
  const verbs = { A: 'Add', M: 'Update', D: 'Remove', R: 'Rename' };
  const groups = new Map(); // verb -> Set(subject)
  for (const { status, file } of entries) {
    const verb = verbs[status[0]] || 'Update';
    if (!groups.has(verb)) groups.set(verb, new Set());
    groups.get(verb).add(describe(file));
  }
  const parts = [];
  for (const [verb, subjects] of groups) {
    const list = [...subjects];
    const shown = list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ');
    parts.push(`${verb} ${shown}`);
  }
  let subject = parts.join('; ');
  if (subject.length > 72) subject = `${subject.slice(0, 69).trimEnd()}...`;
  const body = entries.map(({ status, file }) => `${status[0]}  ${file}`).join('\n');
  return `${subject}\n\n${body}\n\nAuto-committed by scripts/auto-deploy.mjs after passing validation.`;
}

// ---------- deploy tracking ----------

async function waitForVercel(sha) {
  const started = Date.now();
  log('Waiting for Vercel production build...');
  while (Date.now() - started < DEPLOY_TIMEOUT_MS) {
    await sleep(20000);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}/statuses`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'auto-deploy-script' },
      });
      if (res.status === 403 || res.status === 429) {
        log('GitHub API rate limit reached — skipping deploy tracking (Vercel still deploys).');
        return 'unknown';
      }
      const statuses = await res.json();
      const vercel = Array.isArray(statuses) ? statuses.find((s) => s.context === 'Vercel') : null;
      if (vercel && vercel.state !== 'pending') {
        log(`Vercel: ${vercel.description} (${vercel.state})`);
        if (vercel.state !== 'success') log(`Build logs: ${vercel.target_url}`);
        return vercel.state;
      }
    } catch (err) {
      log(`Could not read deploy status: ${err.message}`);
    }
  }
  log('Timed out waiting for Vercel — check the Vercel dashboard.');
  return 'timeout';
}

function smokeTest(url = PROD_URL) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'smoke-test.mjs'), url], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  console.log((r.stdout || '') + (r.stderr || ''));
  return r.status === 0;
}

// Render builds the same push on its own; wait until its URL reports this commit, then smoke test it.
function checkRender(sha) {
  if (!RENDER_URL) return;
  log(`Waiting for Render to deploy to ${RENDER_URL}...`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'wait-for-deploy.mjs'), RENDER_URL, sha], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status === 2) return log(`Render is not set up yet at ${RENDER_URL} — see README, "Continuous Deployment".`);
  if (r.status !== 0) return log(`Render did not pick up ${sha.slice(0, 7)} in time — check the Render dashboard.`);
  log(smokeTest(RENDER_URL) ? `LIVE: ${RENDER_URL} is serving ${sha.slice(0, 7)}.` : 'Smoke test FAILED on the Render site — investigate now.');
}

// ---------- main pipeline ----------

function inProgressGitOperation() {
  const gitDir = path.join(ROOT, '.git');
  return ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'].some((f) => fs.existsSync(path.join(gitDir, f)));
}

async function deploy() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    if (inProgressGitOperation()) {
      log('A merge/rebase is in progress — resolve it first; will retry on next change.');
      return;
    }
    if (git('rev-parse --abbrev-ref HEAD') !== BRANCH) {
      log(`Not on ${BRANCH} — auto-deploy only publishes ${BRANCH}.`);
      return;
    }

    const porcelain = git('status --porcelain');
    const unpushed = Number(git(`rev-list --count origin/${BRANCH}..HEAD`) || 0);
    if (!porcelain && !unpushed) {
      log('No changes to deploy.');
      return;
    }

    if (porcelain) {
      const changed = porcelain.split('\n').map((l) => l.slice(3));
      const areas = new Set(changed.map((f) => (f.startsWith('client/') ? 'client' : f.startsWith('server/') ? 'server' : 'all')));
      const scope = areas.size === 1 && !areas.has('all') ? [...areas][0] : '';
      log(`Validating ${changed.length} changed file(s)${scope ? ` (${scope})` : ''}...`);
      const v = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify.mjs'), ...(scope ? [scope] : [])], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      console.log((v.stdout || '').trim());
      if (v.status !== 0) {
        log('Validation failed — NOT committing or pushing. Fix the errors above; it retries on the next save.');
        return;
      }

      git('add -A');
      const entries = git('diff --cached --name-status')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [status, ...rest] = l.split('\t');
          return { status, file: rest[rest.length - 1] };
        });
      const secret = entries.find((e) => /(^|\/)\.env(\.|$)/.test(e.file));
      if (secret) {
        git('reset -q');
        log(`Refusing to commit secrets file ${secret.file}. Add it to .gitignore.`);
        return;
      }
      const msgFile = path.join(ROOT, '.git', 'AUTO_DEPLOY_MSG');
      fs.writeFileSync(msgFile, commitMessage(entries));
      git(`commit -q -F "${msgFile}"`);
      fs.unlinkSync(msgFile);
      log(`Committed: ${git('log -1 --format=%s')}`);
    }

    // Bring in anything pushed from elsewhere (e.g. GitHub web edits) so the push never gets rejected.
    git(`pull --rebase --autostash -q origin ${BRANCH}`);
    git(`push -q origin ${BRANCH}`);
    const sha = git('rev-parse HEAD');
    log(`Pushed ${sha.slice(0, 7)} to GitHub — deploying to ${PROD_URL} (Vercel) and ${RENDER_URL} (Render)`);

    const state = await waitForVercel(sha);
    if (state === 'success') {
      log('Running live smoke test...');
      log(smokeTest() ? `LIVE: ${PROD_URL} is serving ${sha.slice(0, 7)}.` : 'Smoke test FAILED on the live site — investigate now.');
    } else if (state === 'failure' || state === 'error') {
      log(`Vercel build failed — production URL still serves the previous good version.`);
    }
    checkRender(sha);
  } catch (err) {
    log(`Deploy step failed:\n${(err.stderr || err.message || '').toString().trim()}`);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      schedule();
    }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(deploy, DEBOUNCE_MS);
}

// Single instance: the login auto-start and a manual launch must not both commit the same changes.
const LOCK = path.join(ROOT, '.git', 'auto-deploy.pid');
try {
  const other = Number(fs.readFileSync(LOCK, 'utf8'));
  if (other && other !== process.pid) {
    process.kill(other, 0); // throws if that process is gone
    log(`Auto-deploy is already running (PID ${other}) — this window can be closed.`);
    process.exit(0);
  }
} catch {
  /* no lock, or stale lock */
}
fs.writeFileSync(LOCK, String(process.pid));
const releaseLock = () => {
  try {
    if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK);
  } catch { /* already gone */ }
};
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

if (ONCE) {
  await deploy();
} else {
  watch(ROOT, { recursive: true }, (_event, file) => {
    if (isIgnored(file)) return;
    log(`Change detected: ${file}`);
    schedule();
  });
  log(`Watching ${ROOT}`);
  log(`Changes are validated, committed, pushed, and deployed to ${PROD_URL} automatically.`);
  deploy(); // publish anything already changed before the watcher started
}
