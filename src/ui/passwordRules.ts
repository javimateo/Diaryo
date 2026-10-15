import { PASSWORD_MIN } from '../cloud/account';
import type { Messages } from '../i18n';

/** The diary password's rules (no interface here: passwordForm.tsx draws the fields). */

/** The diary password allows long phrases. */
export const PHRASE_MAX = 200;

/** What is wrong with a new diary password and its repetition, or null. */
export function newPasswordError(password: string, repeat: string, t: Messages): string | null {
  if (password.length < PASSWORD_MIN) return t.account.errors.shortPassword(PASSWORD_MIN);
  if (password !== repeat) return t.vault.errors.mismatch;
  return null;
}
