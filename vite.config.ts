import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Keep the React runtime in its own long-lived, cacheable chunk.
            // recharts is intentionally left out so it stays in the lazily loaded
            // results chunk rather than being pulled into the initial bundle.
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
