import { addDays, parseDay, todayKey, type DayKey } from '../lib/dates';
import type { TextDates } from '../engine/text';
import { completeDates, dateTone, type When } from '../lib/when';
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

/** "9:00" / "9:00 AM", from minutes since 0:00. */
export const formatClock = (minutes: number) =>
  format({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, 0, minutes));

/**
 * A task's or an appointment's date, short: "hoy 10:00", "mañana", "sáb 21:30", "17 oct",
 * "3 ene 2027 9:00–10:30".
 */
export function formatWhen(when: When, today = todayKey()): string {
  const { day } = when;
  let text = relativeDay(day, today)?.toLocaleLowerCase(locale());
  const inWeek = [2, 3, 4, 5, 6].some((n) => addDays(today, n) === day);
  if (!text && inWeek) text = format({ weekday: 'short' }).format(parseDay(day)).replace('.', '');
  if (!text && day.slice(0, 4) === today.slice(0, 4)) text = formatDayMonth(day);
  text ??= format({ day: 'numeric', month: 'short', year: 'numeric' })
    .format(parseDay(day))
    .replace('.', '')
    .replace(' de ', ' ');
  if (when.time !== undefined) text += ` ${formatClock(when.time)}`;
  if (when.until !== undefined) text += `–${formatClock(when.until)}`;
  return text;
}

/** "Martes, 13 de octubre, 10:00–11:30" (the date being written, in full). */
export function formatWhenLong(when: When, today = todayKey()): string {
  let text = formatDay(when.day, today);
  if (when.time !== undefined) text += `, ${formatClock(when.time)}`;
  if (when.until !== undefined) text += `–${formatClock(when.until)}`;
  return text;
}

/** How the dates are labelled now, in the app's language. */
export function dateLabels(now = Date.now()): TextDates {
  const today = todayKey();
  const language = getLanguage();
  const monthFirst = language === 'en';
  return {
    today,
    monthFirst,
    label: (mark, task) => ({ text: formatWhen(mark, today), tone: dateTone(mark, task, now) }),
    complete: (text) => completeDates(text, today, language, monthFirst),
  };
}
