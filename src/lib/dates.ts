/** A diary day as YYYY-MM-DD text (local time): it sorts correctly as text. */
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): DayKey {
  return dayKey(new Date());
}

/** Local date at noon (avoids jumps from daylight saving changes). */
export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/**
 * The days of the month in weeks (Monday to Sunday, or Sunday to Saturday); the gaps from
 * other months are null. `month` goes from 0 to 11.
 */
export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): (DayKey | null)[][] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (DayKey | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(dayKey(new Date(year, month, d, 12)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
