/** Día del diario como texto AAAA-MM-DD (hora local): se ordena bien como texto. */
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): DayKey {
  return dayKey(new Date());
}

/** Fecha local a mediodía (evita saltos por cambios de hora). */
export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' });
const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Hoy", "Ayer", "Mañana" o null. */
export function relativeDay(key: DayKey, today = todayKey()): string | null {
  if (key === today) return 'Hoy';
  if (key === addDays(today, -1)) return 'Ayer';
  if (key === addDays(today, 1)) return 'Mañana';
  return null;
}

/** "Jueves, 24 de septiembre" (con el año si no es el actual). */
export function formatDay(key: DayKey, today = todayKey()): string {
  const date = parseDay(key);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return capitalize(
    `${weekday.format(date)}, ${(sameYear ? dayMonth : dayMonthYear).format(date)}`,
  );
}

/** "jue 24" */
export function formatShortDay(key: DayKey): string {
  return shortDay.format(parseDay(key)).replace('.', '');
}

const dayShortMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** "24 sep" */
export function formatDayMonth(key: DayKey): string {
  return dayShortMonth.format(parseDay(key)).replace('.', '');
}

/** "Septiembre de 2026" */
export function formatMonth(year: number, month: number): string {
  return capitalize(monthYear.format(new Date(year, month, 1, 12)));
}

const MONDAY_FIRST = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Iniciales de la semana, empezando en lunes (1) o en domingo (0). */
export function weekdayInitials(weekStart: 0 | 1 = 1): string[] {
  return weekStart === 1 ? MONDAY_FIRST : ['D', ...MONDAY_FIRST.slice(0, 6)];
}

/**
 * Días del mes en semanas (de lunes a domingo, o de domingo a sábado); los huecos de
 * otros meses son null.
 * `month` va de 0 a 11.
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
