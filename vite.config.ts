import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 4111,
    strictPort: true,
    host: true,
    watch: {
      ignored: [
        '**/.data/**',
        '**/uploads/**',
        '**/server/**',
        '**/server.ts',
        '**/.env*',
        '**/dist/**',
        /[\\/]\.data[\\/]/,
        /[\\/]uploads[\\/]/,
      ],
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
