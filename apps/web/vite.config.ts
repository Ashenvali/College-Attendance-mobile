import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Preview hosts must be explicitly listed in VITE_ALLOWED_HOSTS when they differ from
// Vite's safe localhost/IP defaults. Do not disable host validation on this API-proxying server.
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    ...(allowedHosts.length ? { allowedHosts } : {}),
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
