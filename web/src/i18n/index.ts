import { en } from './en';
import { es, type WebMessages } from './es';

export type Lang = 'es' | 'en';

const MESSAGES: Record<Lang, WebMessages> = { es, en };

/** The website texts in a language. */
export const texts = (lang: Lang): WebMessages => MESSAGES[lang];

/** The home page of a language. */
export const homeHref = (lang: Lang): string => (lang === 'es' ? '/' : '/en/');

/** The other pages (the legal ones and the help), at their address in each language. */
export type Page = 'privacy' | 'terms' | 'help';

const PAGES: Record<Lang, Record<Page, string>> = {
  es: { privacy: '/privacidad/', terms: '/condiciones/', help: '/ayuda/' },
  en: { privacy: '/en/privacy/', terms: '/en/terms/', help: '/en/help/' },
};

export const pageHref = (lang: Lang, page: Page): string => PAGES[lang][page];

/** The address of the same page (the home page, or another one) in the other language. */
export const otherLang = (lang: Lang, page?: Page): { lang: Lang; href: string } => {
  const other: Lang = lang === 'es' ? 'en' : 'es';
  return { lang: other, href: page ? pageHref(other, page) : homeHref(other) };
};

/** Fills the `{name}` holes of a text. */
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (hole, name: string) => String(values[name] ?? hole));

/** A size in megabytes, written the way the language does ("3,3 MB" / "3.3 MB"). */
export const formatSize = (mb: number, lang: Lang): string =>
  `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(mb)} MB`;
