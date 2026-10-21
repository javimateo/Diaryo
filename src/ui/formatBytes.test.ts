import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { formatBytes } from './formatBytes';

afterEach(() => setLanguage('es'));

describe('a size for people', () => {
  it('in KB, MB or GB, with one decimal at most, in the language shown', () => {
    setLanguage('es');
    expect(formatBytes(820 * 1024)).toBe('820 KB');
    expect(formatBytes(12.5 * 1024 ** 2)).toBe('12,5 MB');
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1,3 GB');
    setLanguage('en');
    expect(formatBytes(12.5 * 1024 ** 2)).toBe('12.5 MB');
  });

  it('changes unit right at the limit', () => {
    setLanguage('en');
    expect(formatBytes(1024 ** 2 - 1)).toMatch(/KB$/);
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
  });
});
