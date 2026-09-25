// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

/**
 * Website of diaryo: presentation and downloads. Spanish at `/` (default) and English at
 * `/en/`. The public URL comes from SITE_URL (set it in Coolify); locally, the dev server.
 */
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  integrations: [react()],
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: false },
  },
});
