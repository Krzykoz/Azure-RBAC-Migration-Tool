import path from 'path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// Two Vitest projects share one alias config:
//  - "logic": framework-agnostic *.test.ts run in the fast Node environment,
//    exactly as before the SolidJS migration.
//  - "components": Solid *.test.tsx run in jsdom, compiled by vite-plugin-solid,
//    with @testing-library/jest-dom matchers loaded only here.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          clearMocks: true,
        },
      },
      {
        extends: true,
        plugins: [solid()],
        resolve: {
          // Resolve solid-js to its browser/DOM build so render() works in
          // jsdom; without this Vitest picks the SSR build and Solid throws
          // "Client-only API called on the server side."
          conditions: ['development', 'browser'],
        },
        test: {
          name: 'components',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.{test,spec}.tsx'],
          setupFiles: ['src/test/setup.ts'],
          clearMocks: true,
          server: {
            deps: {
              inline: [/solid-js/, /@solidjs\/testing-library/],
            },
          },
        },
      },
    ],
  },
});
