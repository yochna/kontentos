import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The suite runs against the local JSON store, never Atlas: MONGODB_URI is blanked before any
// module reads it. Each server test file then points KONTENTOS_DATA_DIR at its own directory
// under this base, because the store is a single whole-file read-modify-write.
const scratchDataDir = path.join(os.tmpdir(), 'kontentos-vitest-db');

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    env: {
      MONGODB_URI: '',
      NODE_ENV: 'test',
      KONTENTOS_DATA_DIR: scratchDataDir,
    },
    testTimeout: 20000,
  },
});
