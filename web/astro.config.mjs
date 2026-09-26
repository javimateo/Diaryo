// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

/** The app's code (`../src`): the demo draws with the same engine and diary. */
const app = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Website of diaryo: presentation and downloads. Spanish at `/` (default) and English at
 * `/en/`. The public URL comes from SITE_URL (set it in Coolify); locally, the dev server.
 * The app's dependencies come from the app's own `node_modules` (install both).
 */
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  integrations: [react()],
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    resolve: {
      alias: { '@app': app },
      // One React for the website and the app's code (which would find the app's copy).
      dedupe: ['react', 'react-dom'],
    },
    server: { fs: { allow: ['..'] } },
  },
});
