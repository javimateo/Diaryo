import { t, type Messages } from '../i18n';
import { useUI } from '../store/ui';

/** The texts of the active language; the component re-renders when the language changes. */
export function useT(): Messages {
  useUI((s) => s.settings.language);
  return t();
}
