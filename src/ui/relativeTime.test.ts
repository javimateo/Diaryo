import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { relativeTime } from './relativeTime';

afterEach(() => setLanguage('es'));

/** What Intl writes, to check which unit is chosen (not Intl's own words). */
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
const NOW = new Date(2026, 9, 15, 12, 0).getTime();
const ago = (ms: number) => NOW - ms;
const MIN = 60_000;

describe('how long ago', () => {
  it('"now" under a minute, then minutes, then hours', () => {
    setLanguage('en');
    expect(relativeTime(ago(30_000), NOW)).toBe(rtf.format(0, 'second'));
    expect(relativeTime(ago(5 * MIN), NOW)).toBe(rtf.format(-5, 'minute'));
    expect(relativeTime(ago(2 * 60 * MIN), NOW)).toBe(rtf.format(-2, 'hour'));
  });

  it('the date and time after six hours', () => {
    setLanguage('en');
    const time = ago(7 * 60 * MIN);
    const date = new Date(time).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
    expect(relativeTime(time, NOW)).toBe(date);
  });
});
