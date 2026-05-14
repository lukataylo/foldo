import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production (Railway) sets PORT; dev keeps the existing 5174 default.
const previewPort = process.env.PORT ? Number(process.env.PORT) : 5174;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    hmr: {
      clientPort: 5174,
    },
  },
  preview: {
    port: previewPort,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
