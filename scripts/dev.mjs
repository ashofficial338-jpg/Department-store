// Starts the API server and the Vite client together, with prefixed output.
//
// Usage (from the project root):  npm run dev
// Stop with Ctrl+C (stops both). If either process exits, the other is stopped too.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

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

// Resolves once something accepts TCP connections on host:port (polls every 500ms).
function waitForPort(port, host = '127.0.0.1', timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (shuttingDown) return;
        if (Date.now() - started > timeoutMs) reject(new Error(`timed out waiting for ${host}:${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function start({ name, color }) {
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

// Start the API first and only launch Vite once the API is listening, so the dev proxy
// never forwards /api requests to a server that isn't up yet (ECONNREFUSED 127.0.0.1:5000).
const API_PORT = Number(process.env.PORT || 5000);
const [server, client] = APPS;
start(server);
console.log(`\x1b[2m[dev] waiting for API on port ${API_PORT}...\x1b[0m`);
waitForPort(API_PORT)
  .then(() => { if (!shuttingDown) start(client); })
  .catch((err) => { console.error(`[dev] ${err.message}`); shutdown(1); });

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
