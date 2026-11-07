import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview/dev server proxies /api to the local Express service (and/health), so the browser
// only ever talks to its own origin. allowedHosts is "*" because preview URLs are assigned
// dynamically; the server is never exposed to the public internet without a proxy in front.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: true },
      '/health': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: true },
      '/mobile': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
