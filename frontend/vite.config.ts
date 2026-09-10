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
  server: {
    port: 3000,
  },
  build: {
    outDir:    'dist',
    target:    'esnext',
    sourcemap: false,
  },
});
