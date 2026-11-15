// Watches the project and automatically commits + pushes changes to GitHub,
// which triggers the hosting provider's deploy of the live site.
//
// Usage (from the project root):  node scripts/auto-deploy.mjs
// Stop with Ctrl+C.

import { watch } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEBOUNCE_MS = 5000; // wait for edits to settle before deploying
const IGNORED = ['.git', 'node_modules', 'dist', 'build', 'uploads', '.env', '.vscode', '.idea'];

let timer = null;
let running = false;
let pending = false;

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

function isIgnored(file) {
  if (!file) return true;
  const parts = file.split(/[\\/]/);
  return parts.some((p) => IGNORED.includes(p) || p.startsWith('.env') || p.endsWith('~') || p.endsWith('.swp'));
}

function deploy() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    git('add -A');
    const changed = git('diff --cached --name-only');
    if (!changed) {
      log('No changes to deploy.');
      return;
    }
    const files = changed.split('\n');
    const summary = files.length <= 3 ? files.join(', ') : `${files.length} files`;
    git(`commit -m "Auto-deploy: update ${summary.replace(/"/g, "'")}"`);
    log(`Committed: ${summary}`);
    git('push');
    log('Pushed to GitHub — live site will redeploy shortly.');
  } catch (err) {
    log(`Deploy failed:\n${err.stderr || err.message}`);
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

watch(ROOT, { recursive: true }, (_event, file) => {
  if (isIgnored(file)) return;
  log(`Change detected: ${file}`);
  schedule();
});

log(`Watching ${ROOT} — changes will be committed and pushed automatically.`);
deploy(); // push anything already changed before the watcher started
