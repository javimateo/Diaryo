/** The website's data that isn't text: change it here and it changes everywhere. */
export const SITE = {
  name: 'diaryo',
  repo: 'https://github.com/javimateo/Diaryo',
  releases: 'https://github.com/javimateo/Diaryo/releases/latest',
  license: 'PolyForm Noncommercial 1.0.0',
  licenseUrl: 'https://polyformproject.org/licenses/noncommercial/1.0.0/',
  /** Who is responsible for the cloud and the website (the privacy policy and the terms). */
  owner: 'Javier Mateo',
  contact: 'privacidad@javiermateo.dev',
  /** The web app (PLAN.md, H6). While it isn't set, the site doesn't offer it. */
  app: (import.meta.env.APP_URL as string | undefined) || null,
  /**
   * Umami (visits without cookies, PLAN.md H8): its script and this site's id. While they
   * aren't set, nothing is counted.
   */
  analytics: {
    src: (import.meta.env.UMAMI_SRC as string | undefined) || null,
    id: (import.meta.env.UMAMI_ID as string | undefined) || null,
  },
  /** The installer if GitHub can't be asked when building (see `release.ts`). */
  download: { version: '0.2.0', sizeMB: 4.2, file: 'diaryo_0.2.0_x64-setup.exe' },
};
