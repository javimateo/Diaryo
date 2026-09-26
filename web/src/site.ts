/** The website's data that isn't text: change it here and it changes everywhere. */
export const SITE = {
  name: 'diaryo',
  repo: 'https://github.com/javimateo/Diaryo',
  releases: 'https://github.com/javimateo/Diaryo/releases/latest',
  license: 'PolyForm Noncommercial 1.0.0',
  /** The web app (PLAN.md, H6). While it isn't set, the site doesn't offer it. */
  app: (import.meta.env.APP_URL as string | undefined) || null,
  /** The installer if GitHub can't be asked when building (see `release.ts`). */
  download: { version: '0.2.0', sizeMB: 3.3, file: 'diaryo_0.2.0_x64-setup.exe' },
};
