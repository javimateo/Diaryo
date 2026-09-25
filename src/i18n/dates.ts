import { addDays, parseDay, todayKey, type DayKey } from '../lib/dates';
import { getLanguage, locale, t } from './index';

/** Dates as text, in the active language. */

/** Date formats are created once per language. */
const cache = new Map<string, Intl.DateTimeFormat>();
function format(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale() + JSON.stringify(options);
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale(), options);
    cache.set(key, formatter);
  }
  return formatter;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Today", "Yesterday", "Tomorrow" or null. */
export function relativeDay(key: DayKey, today = todayKey()): string | null {
  const { dates } = t();
  if (key === today) return dates.today;
  if (key === addDays(today, -1)) return dates.yesterday;
  if (key === addDays(today, 1)) return dates.tomorrow;
  return null;
}

/**
 * "Jueves, 24 de septiembre" / "Thursday, September 24" (with the year if it isn't the
 * current one).
 */
export function formatDay(key: DayKey, today = todayKey()): string {
  const date = parseDay(key);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  if (!sameYear) options.year = 'numeric';
  return capitalize(format(options).format(date));
}

/** "jue 24" / "Thu 24" */
export function formatShortDay(key: DayKey): string {
  return format({ weekday: 'short', day: 'numeric' }).format(parseDay(key)).replace('.', '');
}

/** "24 sep" / "Sep 24" */
export function formatDayMonth(key: DayKey): string {
  return format({ day: 'numeric', month: 'short' }).format(parseDay(key)).replace('.', '');
}

/** "Septiembre de 2026" / "September 2026" */
export function formatMonth(year: number, month: number): string {
  return capitalize(
    format({ month: 'long', year: 'numeric' }).format(new Date(year, month, 1, 12)),
  );
}

/** "10:42" */
export const formatTime = (time: number) =>
  format({ hour: '2-digit', minute: '2-digit' }).format(time);

/** Weekday initials, starting on Monday (1) or Sunday (0). */
export function weekdayInitials(weekStart: 0 | 1 = 1): string[] {
  const mondayFirst = t().dates.weekdayInitials;
  return weekStart === 1 ? mondayFirst : [mondayFirst[6], ...mondayFirst.slice(0, 6)];
}

/** To compare texts ignoring case (search). */
export const lower = (text: string) => text.toLocaleLowerCase(getLanguage());
