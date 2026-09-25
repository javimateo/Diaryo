import { en } from './en';
import { es, type WebMessages } from './es';

export type Lang = 'es' | 'en';

const MESSAGES: Record<Lang, WebMessages> = { es, en };

/** The website texts in a language. */
export const texts = (lang: Lang): WebMessages => MESSAGES[lang];

/** The address of the same page in the other language. */
export const otherLang = (lang: Lang): { lang: Lang; href: string } =>
  lang === 'es' ? { lang: 'en', href: '/en/' } : { lang: 'es', href: '/' };
