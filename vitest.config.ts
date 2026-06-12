import { defineConfig } from 'vitest/config';

// Standalone Vitest config (does not reuse vite.config.ts). Logic tests run in
// the Node environment; Vite's default pipeline handles `?raw` and JSON imports.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    clearMocks: true,
  },
});
