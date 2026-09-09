import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      // Compiled contract output
      '@contract': path.resolve(__dirname, '../contract/managed/credit-attestation/contract'),
      // Issuer service — resolve monorepo sibling without relative path crossing
      '@issuer': path.resolve(__dirname, '../issuer-service'),
    },
  },
  // Ensure .ts files in monorepo siblings are processed
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/compact-runtime'],
  },
  server: {
    port: 3000,
  },
  // Suppress sourcemap warnings from third-party packages that don't ship sources
  build: {
    outDir:       'dist',
    target:       'esnext',
    sourcemap:    false,
  },
  css: {
    devSourcemap: false,
  },
});
