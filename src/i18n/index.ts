import { en } from './en';
import { es, type Messages } from './es';

/**
 * Languages of the app. The texts of each one live in their own file (`es.ts` is the
 * reference: `en.ts` must have the same shape, and TypeScript complains if something is
 * missing or left over). Texts that take data ("2 tareas") are functions.
 */
export type Language = 'es' | 'en';

export const LANGUAGES: Record<Language, string> = { es: 'Español', en: 'English' };

export const DEFAULT_LANGUAGE: Language = 'es';

export const isLanguage = (value: unknown): value is Language => value === 'es' || value === 'en';

export type { Messages };

const MESSAGES: Record<Language, Messages> = { es, en };

/** For dates and numbers. */
const LOCALES: Record<Language, string> = { es: 'es-ES', en: 'en-US' };

let current: Language = DEFAULT_LANGUAGE;

/** Changes the active language (the UI state does it when loading or changing the setting). */
export function setLanguage(language: Language) {
  current = language;
}

export const getLanguage = () => current;

/** The texts of the active language. */
export const t = (): Messages => MESSAGES[current];

/** The active language for `Intl` (dates, numbers). */
export const locale = () => LOCALES[current];
