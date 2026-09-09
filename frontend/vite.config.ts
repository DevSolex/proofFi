import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

// Suppress "points to missing source files" warnings from third-party packages
// that don't ship their original TypeScript sources (compact-runtime, etc.)
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes('points to missing source files')) return;
  originalWarn(msg, options);
};

export default defineConfig({
  customLogger: logger,
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
