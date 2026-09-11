import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@contract': path.resolve(__dirname, '../contract/managed/credit-attestation/contract'),
      '@issuer':   path.resolve(__dirname, '../issuer-service'),
    },
  },
  // Proxy /api/* → local simulation server on port 3001
  // This avoids CORS issues and extension interference with direct localhost:3001 calls
  server: {
    port: 3000,
    host: '0.0.0.0',   // bind to all interfaces including ::1 (IPv6 localhost)
    proxy: {
      '/__sim': {
        target:       'http://localhost:3001',
        changeOrigin: true,
        rewrite:      (path) => path.replace(/^\/__sim/, ''),
      },
    },
  },
  build: {
    outDir:    'dist',
    target:    'esnext',
    sourcemap: false,
  },
});
