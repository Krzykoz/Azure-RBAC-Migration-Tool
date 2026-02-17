import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron' || !!process.env.ELECTRON;

  return {
    base: isElectron ? './' : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron([
              {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    lib: {
                      entry: 'electron/main.ts',
                      formats: ['es'],
                      fileName: () => 'main.mjs',
                    },
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              {
                entry: 'electron/preload.ts',
                onstart(args) {
                  args.reload();
                },
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    lib: {
                      entry: 'electron/preload.ts',
                      formats: ['es'],
                      fileName: () => 'preload.mjs',
                    },
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            ]),
            renderer(),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
