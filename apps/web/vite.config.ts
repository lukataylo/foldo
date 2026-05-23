import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production (Railway) sets PORT; dev keeps the existing 5173 default.
const previewPort = process.env.PORT ? Number(process.env.PORT) : 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: previewPort,
    host: '0.0.0.0',
    // Railway-style hosts are not known up front; accept any host header.
    // (vite preview rejects unknown hosts by default in v5.)
    allowedHosts: true,
  },
  build: {
    // Chunk splits that pair with the route-level React.lazy() in main.tsx:
    //   - `react-vendor`: React + ReactDOM, the heaviest shared dep. Splits
    //     out so a route-level reload doesn't reparse them.
    //   - `protocol`: shared types/util. Tiny today but every route imports
    //     it, so a separate chunk keeps it cacheable across deploys when the
    //     route bundles change.
    // The route bundles themselves (App, MarketingRouter, HomeApp, etc.)
    // become their own chunks automatically via dynamic import.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          protocol: ['@foldo/protocol'],
        },
      },
    },
  },
});
