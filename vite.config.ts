import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // dev server proxies sockets to the room server, which also serves the built app
  server: {
    host: '0.0.0.0',
    port: 5180,
    proxy: { '/socket.io': { target: 'http://localhost:4180', ws: true } },
  },
  build: { target: 'es2022' },
});
