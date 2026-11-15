// Live URLs of every deployment, read from deploy.config.json (the single place to change them).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TARGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy.config.json'), 'utf8'));

// Accepts a target name ("vercel", "render") or a full URL.
export function resolveUrl(nameOrUrl, fallback = 'vercel') {
  const value = nameOrUrl || fallback;
  const url = /^https?:\/\//.test(value) ? value : TARGETS[value];
  if (!url) throw new Error(`Unknown deploy target "${value}". Known: ${Object.keys(TARGETS).join(', ')}`);
  return url.replace(/\/$/, '');
}

// Appends a line to the GitHub Actions run summary (no-op outside Actions).
export function summarize(line) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
