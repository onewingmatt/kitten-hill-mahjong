import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The build a crash came from: a telemetry event with no commit cannot be pinned to a diff. */
const buildId = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return 'unknown';
  }
})();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildId) },
  // dev server proxies sockets to the room server, which also serves the built app
  server: {
    host: '0.0.0.0',
    port: 5180,
    proxy: { '/socket.io': { target: 'http://localhost:4180', ws: true } },
  },
  build: { target: 'es2022' },
});
