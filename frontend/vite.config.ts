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
    // Strip sourcemap references from packages that don't ship their sources.
    // This prevents the "points to missing source files" noise in the terminal.
    {
      name: 'strip-sourcemap-comments',
      transform(code, id) {
        if (
          id.includes('compact-runtime') ||
          id.includes('credit-attestation/contract')
        ) {
          return {
            code: code.replace(/\/\/# sourceMappingURL=.*/g, ''),
            map: null,
          };
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@contract': path.resolve(__dirname, '../contract/managed/credit-attestation/contract'),
      '@issuer':   path.resolve(__dirname, '../issuer-service'),
    },
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/compact-runtime'],
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
