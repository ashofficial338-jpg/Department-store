// Starts the API server and the Vite client together, with prefixed output.
//
// Usage (from the project root):  npm run dev
// Stop with Ctrl+C (stops both). If either process exits, the other is stopped too.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = [
  { name: 'server', color: 36 }, // cyan
  { name: 'client', color: 35 }, // magenta
];

const children = [];
let shuttingDown = false;

function pipe(stream, label) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) console.log(`${label} ${line}`);
  });
  stream.on('end', () => buffer && console.log(`${label} ${buffer}`));
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows, kill the whole process tree (npm -> nodemon/vite -> node).
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

for (const { name, color } of APPS) {
  const label = `\x1b[${color}m[${name}]\x1b[0m`;
  const child = spawn('npm run dev', {
    cwd: path.join(ROOT, name),
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  pipe(child.stdout, label);
  pipe(child.stderr, label);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`${label} exited with code ${code}; stopping the other process.`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
