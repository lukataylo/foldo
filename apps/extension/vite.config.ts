import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { manifest } from './src/manifest';

// crxjs v2 beta integrates Manifest V3 + Vite. It reads the manifest, bundles
// each entrypoint (service worker, content scripts, popup), and emits a
// `manifest.json` plus all assets into `dist/` ready to load unpacked.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      // crxjs handles the entry inputs from the manifest — we only need to
      // ensure HMR-friendly output naming.
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    hmr: {
      port: 5181,
    },
  },
});
