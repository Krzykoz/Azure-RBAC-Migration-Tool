import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    // Defaults to 3000; honors PORT so harnesses can assign a free port.
    port: Number(process.env.PORT) || 3000,
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
});
