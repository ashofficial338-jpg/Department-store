import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const API_PORT = 5000;
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

// Resolves once the API accepts connections, or after `timeoutMs` so a genuinely dead API still
// surfaces as a proxy error. A recent successful probe is reused so requests are not slowed down.
let apiSeenAt = 0;
let apiWait = null;
function waitForApi(timeoutMs = 30000) {
  if (Date.now() - apiSeenAt < 500) return Promise.resolve();
  apiWait ??= (async () => {
    const deadline = Date.now() + timeoutMs;
    while (!(await isPortOpen(API_PORT))) {
      if (Date.now() > deadline) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    apiSeenAt = Date.now();
  })().finally(() => { apiWait = null; });
  return apiWait;
}

// Running `npm run dev` in client/ alone used to leave every /api call failing with ECONNREFUSED,
// because nothing was listening on port 5000. This starts the API server alongside Vite whenever
// it is not already running (e.g. from the root `npm run dev` or a separate terminal).
function startApiServer() {
  return {
    name: 'aurelia-start-api-server',
    apply: 'serve',
    async configureServer(server) {
      // Hold /api and /uploads requests while the API is still booting (or nodemon is restarting
      // it) instead of letting the proxy fail them with ECONNREFUSED. Runs before Vite's proxy.
      server.middlewares.use(async (req, _res, next) => {
        if (/^\/(api|uploads)(\/|\?|$)/.test(req.url || '')) await waitForApi();
        next();
      });

      // The root `npm run dev` starts the API itself; globalThis survives Vite's config-change
      // restarts, so the API is only ever spawned once.
      if (process.env.AURELIA_API_MANAGED || globalThis.__aureliaApi || (await isPortOpen(API_PORT))) return;

      const label = '\x1b[36m[server]\x1b[0m';
      const child = spawn('npm run dev', { cwd: SERVER_DIR, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
      globalThis.__aureliaApi = child;

      const print = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.log(`${label} ${line}`);
      };
      child.stdout.on('data', print);
      child.stderr.on('data', print);
      child.on('exit', (code) => {
        globalThis.__aureliaApi = null;
        console.log(`${label} API server stopped (code ${code}). Restart Vite to start it again.`);
      });

      // Stop the API (npm -> nodemon -> node) when Vite exits.
      process.once('exit', () => {
        if (child.exitCode !== null) return;
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else child.kill('SIGTERM');
      });
      console.log(`${label} API server was not running - starting it on port ${API_PORT}...`);
    },
  };
}

export default defineConfig({
  plugins: [react(), startApiServer()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
