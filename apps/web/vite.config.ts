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
});
