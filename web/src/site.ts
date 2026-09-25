/** The website's data that isn't text: change it here and it changes everywhere. */
export const SITE = {
  name: 'diaryo',
  repo: 'https://github.com/javimateo/Diaryo',
  releases: 'https://github.com/javimateo/Diaryo/releases/latest',
  license: 'MIT',
  /** The web app (PLAN.md, H6). While it isn't set, the site doesn't offer it. */
  app: (import.meta.env.APP_URL as string | undefined) || null,
  /** The current installer. H5 will read it from GitHub Releases when building. */
  download: { version: '0.1.0', sizeMB: 3.3 },
};
