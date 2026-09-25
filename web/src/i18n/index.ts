import { en } from './en';
import { es, type WebMessages } from './es';

export type Lang = 'es' | 'en';

const MESSAGES: Record<Lang, WebMessages> = { es, en };

/** The website texts in a language. */
export const texts = (lang: Lang): WebMessages => MESSAGES[lang];

/** The home page of a language. */
export const homeHref = (lang: Lang): string => (lang === 'es' ? '/' : '/en/');

/** The address of the same page in the other language. */
export const otherLang = (lang: Lang): { lang: Lang; href: string } => {
  const other: Lang = lang === 'es' ? 'en' : 'es';
  return { lang: other, href: homeHref(other) };
};

/** Fills the `{name}` holes of a text. */
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (hole, name: string) => String(values[name] ?? hole));

/** A size in megabytes, written the way the language does ("3,3 MB" / "3.3 MB"). */
export const formatSize = (mb: number, lang: Lang): string =>
  `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(mb)} MB`;
