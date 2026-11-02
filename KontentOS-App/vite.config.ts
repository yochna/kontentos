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
  build: {
    // Two front ends ship from one repo: the cutting-room bench at / and the Studio at /studio.
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        studio: path.resolve(__dirname, 'studio/index.html'),
      },
    },
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
