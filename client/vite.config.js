import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API + static asset routes go to the backend.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/voices':         { target: 'http://localhost:4000', changeOrigin: true },
      '/music-samples':  { target: 'http://localhost:4000', changeOrigin: true },
      // /v/:slug is handled by the React SPA — don't proxy it. (Older versions
      // of this app had a server-side /v/:slug renderer; v4 routes it client-
      // side via ShareViewer.jsx.)
    },
  },
});
