import path from 'path';
import { defineConfig } from 'vitest/config';

// Standalone Vitest config. It deliberately does not reuse vite.config.ts (whose
// default export is a function) so config merging stays simple. Logic tests run in
// the Node environment; Vite's default pipeline handles `?raw` and JSON imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    clearMocks: true,
  },
});
