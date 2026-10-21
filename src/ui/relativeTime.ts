import { locale } from '../i18n';

/** "now", "5 min ago", "2 hours ago", or the date and time if it was longer ago. */
export function relativeTime(time: number, now = Date.now()): string {
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  if (seconds > -60) return format.format(0, 'second');
  if (seconds > -3600) return format.format(Math.round(seconds / 60), 'minute');
  if (seconds > -6 * 3600) return format.format(Math.round(seconds / 3600), 'hour');
  return new Date(time).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}
