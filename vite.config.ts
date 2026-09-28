import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The app only talks to Azure Resource Manager and Microsoft Graph, and holds their tokens in memory.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://management.azure.com https://graph.microsoft.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Build only: the dev server needs inline scripts and a websocket for hot reload.
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  server: {
    // Defaults to 3000; honors PORT so harnesses can assign a free port.
    // Localhost only; use `npm run dev -- --host` to expose it on the network.
    port: Number(process.env.PORT) || 3000,
  },
  plugins: [react(), contentSecurityPolicy()],
});
