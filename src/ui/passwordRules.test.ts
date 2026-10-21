import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN } from '../cloud/account';
import { es } from '../i18n/es';
import { newPasswordError } from './passwordRules';

describe('a new diary password', () => {
  const long = 'x'.repeat(PASSWORD_MIN);

  it('is fine when it is long enough and repeated the same', () => {
    expect(newPasswordError(long, long, es)).toBeNull();
  });

  it('is too short below the minimum (said before the repetition)', () => {
    const short = 'x'.repeat(PASSWORD_MIN - 1);
    expect(newPasswordError(short, 'otra', es)).toBe(es.account.errors.shortPassword(PASSWORD_MIN));
  });

  it("doesn't match its repetition", () => {
    expect(newPasswordError(long, `${long}!`, es)).toBe(es.vault.errors.mismatch);
  });
});
