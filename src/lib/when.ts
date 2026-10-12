import { addDays, dayKey, parseDay, type DayKey } from './dates';

/**
 * Dates written by hand: the days the search understands ("ayer", "lunes", "24 sept") and
 * the dates of tasks and appointments, written in their text after an "@".
 */

/** Without case or accents, to compare ("Mañana" → "manana"). */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const MONTHS_EN = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
/** In the order of `Date.getDay()`. */
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const RELATIVE: Record<string, number> = {
  hoy: 0,
  ayer: -1,
  anteayer: -2,
  manana: 1,
  'pasado manana': 2,
  today: 0,
  yesterday: -1,
  'day before yesterday': -2,
  tomorrow: 1,
  'day after tomorrow': 2,
};

/**
 * Month by its name or its beginning, in Spanish or in English ("sept", "ene", "aug"); -1
 * if not.
 */
function monthOf(word: string): number {
  if (word === 'set' || word === 'setiembre') return 8;
  if (word.length < 3) return -1;
  const es = MONTHS.findIndex((month) => month.startsWith(word));
  return es >= 0 ? es : MONTHS_EN.findIndex((month) => month.startsWith(word));
}

/**
 * Short weekdays, as written in a hurry ("@vie 17:30"). Without "mar": it is also March
 * ("Mar 10").
 */
const SHORT_WEEKDAYS: Record<string, number> = {
  dom: 0,
  lun: 1,
  mart: 2,
  mie: 3,
  mier: 3,
  jue: 4,
  vie: 5,
  sab: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

/** Weekday (0 = Sunday) by its name in Spanish or in English. */
function weekdayOf(name: string): number {
  if (name in SHORT_WEEKDAYS) return SHORT_WEEKDAYS[name];
  return WEEKDAYS.includes(name) ? WEEKDAYS.indexOf(name) : WEEKDAYS_EN.indexOf(name);
}

function day(year: number, month: number, date: number): DayKey | null {
  if (month < 0 || month > 11 || date < 1) return null;
  if (date > new Date(year, month + 1, 0).getDate()) return null;
  return dayKey(new Date(year, month, date, 12));
}

const WEEKDAY = `(${[...WEEKDAYS, ...WEEKDAYS_EN, ...Object.keys(SHORT_WEEKDAYS)].join('|')})`;
const WEEKDAY_QUERY = new RegExp(
  `^(?:el |the )?(proximo |siguiente |next |last |this )?${WEEKDAY}( pasado| que viene| proximo| siguiente)?$`,
);
const NUMERIC_QUERY = /^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?)?$/;
/** "24 sept", "24 de septiembre de 2025", "24th of September". */
const WRITTEN_QUERY =
  /^(\d{1,2})(?:st|nd|rd|th)?(?: de| of)? ([a-z]+)\.?(?:(?: de| del)? (\d{4}))?$/;
/** "September 24", "sep 24 2025" (in English, month first). */
const MONTH_FIRST_QUERY = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/;

/**
 * Understands a day typed by hand, in Spanish or in English: "hoy", "ayer", "lunes", "el
 * lunes pasado", "próximo viernes", "24", "24/9", "24/9/2025", "24 sept", "jueves 24 de
 * septiembre de 2025", "yesterday", "last monday", "Sep 24" or "2025-09-24". Without a
 * year, it is this year. With `monthFirst` (English), "9/24" is month and day. Returns
 * null if it isn't a day. With `ahead` (the date of a task or an appointment), what isn't
 * said looks forward: "lunes" is the next Monday (today if it is Monday) and "3/1" or "15"
 * without a year, the next one to come.
 */
export function parseDayQuery(
  query: string,
  today: DayKey,
  monthFirst = false,
  ahead = false,
): DayKey | null {
  let q = normalize(query).trim().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!q) return null;
  if (q in RELATIVE) return addDays(today, RELATIVE[q]);

  const now = parseDay(today);
  const weekday = WEEKDAY_QUERY.exec(q);
  if (weekday) {
    const [, before, name, after] = weekday;
    const target = weekdayOf(name);
    const current = now.getDay();
    const previous = after === ' pasado' || before === 'last ';
    // Just the name: the last one that happened (today if it is that day);
    // "pasado"/"last", the one before today.
    if ((before && !previous && before !== 'this ') || (after && !previous)) {
      return addDays(today, (target - current + 7) % 7 || 7);
    }
    if (ahead && !before && !after) return addDays(today, (target - current + 7) % 7);
    const back = (current - target + 7) % 7;
    return addDays(today, previous ? -(back || 7) : -back);
  }

  // "jueves 24…", "Thursday, September 24": the weekday is redundant.
  q = q.replace(new RegExp(`^${WEEKDAY} (?=\\d|[a-z])`), '');
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q);
  if (iso) return day(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // Without a year: this year or, looking ahead and already gone, the next one.
  const dated = (text: string | undefined, month: number, date: number) => {
    if (text) return day(text.length === 2 ? 2000 + Number(text) : Number(text), month, date);
    const found = day(now.getFullYear(), month, date);
    return ahead && found && found < today ? day(now.getFullYear() + 1, month, date) : found;
  };
  const numeric = NUMERIC_QUERY.exec(q);
  if (numeric) {
    if (!numeric[2]) {
      const found = day(now.getFullYear(), now.getMonth(), Number(numeric[1]));
      if (!ahead || (found && found >= today)) return found;
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
      return day(next.getFullYear(), next.getMonth(), Number(numeric[1]));
    }
    const [a, b] = [Number(numeric[1]), Number(numeric[2])];
    const [date, month] = monthFirst ? [b, a] : [a, b];
    return dated(numeric[3], month - 1, date);
  }
  const written = WRITTEN_QUERY.exec(q);
  if (written) return dated(written[3], monthOf(written[2]), Number(written[1]));
  const monthFirstWritten = MONTH_FIRST_QUERY.exec(q);
  if (monthFirstWritten) {
    const [, month, date, y] = monthFirstWritten;
    return dated(y, monthOf(month), Number(date));
  }
  return null;
}

// ─── Dates of tasks and appointments ("@mañana 10", "@15 oct 2026 10:00-11:30") ────

/** When a task or an appointment is: its day and, if said, its time (minutes from 0:00). */
export interface When {
  day: DayKey;
  time?: number;
  /** When it ends, for an appointment with a time ("10:00-11:30"). */
  until?: number;
}

/** How a date looks: still to come, a task that is late, or already gone (or done). */
export type DateTone = 'soon' | 'late' | 'past';

/**
 * The moment (ms) a task is due or an appointment is over: its end, its time or, without
 * one, the end of its day.
 */
export function endOf(when: When): number {
  const date = parseDay(when.day);
  date.setHours(0, when.until ?? when.time ?? 24 * 60, 0, 0);
  return date.getTime();
}

/** `task`: the date's line is a task, open or done (null: an appointment). */
export function dateTone(when: When, task: 'open' | 'done' | null, now: number): DateTone {
  if (task === 'done') return 'past';
  if (now < endOf(when)) return 'soon';
  return task === 'open' ? 'late' : 'past';
}

/** A date written in a line after "@": where it is ([start, end), the "@" included). */
export interface DateMark extends When {
  start: number;
  end: number;
}

/** "10", "10:30", "10.30", "10h", "5pm"; minutes from 0:00, or null. */
export function parseTime(text: string): number | null {
  const match = /^(\d{1,2})(?:[:.](\d{2}))?(h|am|pm)?$/i.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const half = match[3]?.toLowerCase();
  if (half === 'am' || half === 'pm') {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (half === 'pm' ? 12 : 0);
  }
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** "10:00" or "10:00-11:30", as said after the day. */
function parseTimes(word: string): { time: number; until?: number } | null {
  const [from, to, ...more] = word.split(/[-–]/);
  const time = parseTime(from);
  if (time === null || more.length > 0) return null;
  if (to === undefined) return { time };
  const until = parseTime(to);
  return until !== null && until > time ? { time, until } : null;
}

/** How many words after the "@" can be the day ("jueves 24 de septiembre de 2026"). */
const DAY_WORDS = 6;

/**
 * The dates written in a line: an "@" at the start of a word followed by a day, a time or
 * both ("@mañana", "@vie 17:30", "@15/10 10:00-11:30", "@10:00" for today). The day looks
 * ahead (see `parseDayQuery`). "ana@mail.com" or "@Lucía" aren't dates.
 */
export function findDates(line: string, today: DayKey, monthFirst = false): DateMark[] {
  const marks: DateMark[] = [];
  const at = /(^|\s)@(?=\S)/g;
  let found: RegExpExecArray | null;
  while ((found = at.exec(line))) {
    const start = found.index + found[1].length;
    // The words after the "@", with where each one ends (without a final "," or ".").
    const words: { text: string; end: number }[] = [];
    const word = /[^\s]+/y;
    word.lastIndex = start + 1;
    for (let i = 0; i < DAY_WORDS + 1; i++) {
      const w = word.exec(line);
      if (!w) break;
      const text = w[0].replace(/[.,;]+$/, '');
      words.push({ text, end: w.index + text.length });
      if (text !== w[0] || line[word.lastIndex] !== ' ') break;
      word.lastIndex++;
    }
    let mark: DateMark | null = null;
    for (let n = Math.min(DAY_WORDS, words.length); n > 0 && !mark; n--) {
      const query = words
        .slice(0, n)
        .map((w) => w.text)
        .join(' ');
      const day = parseDayQuery(query, today, monthFirst, true);
      if (!day) continue;
      mark = { day, start, end: words[n - 1].end };
      const times = words[n] ? parseTimes(words[n].text) : null;
      if (times) Object.assign(mark, times, { end: words[n].end });
    }
    if (!mark && words[0] && /[:.hapm]/i.test(words[0].text)) {
      const times = parseTimes(words[0].text);
      if (times) mark = { day: today, ...times, start, end: words[0].end };
    }
    if (mark) {
      marks.push(mark);
      at.lastIndex = mark.end;
    }
  }
  return marks;
}

const MONTH_ABBR = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const clock = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * A date as it is kept in the text: "@15 oct 2026 10:00-11:30". With the year and the
 * month in letters, it means the same tomorrow, next year and in either language.
 */
export function writeDate(when: When, language: 'es' | 'en'): string {
  const date = parseDay(when.day);
  let text = `@${date.getDate()} ${MONTH_ABBR[language][date.getMonth()]} ${date.getFullYear()}`;
  if (when.time !== undefined) text += ` ${clock(when.time)}`;
  if (when.until !== undefined) text += `-${clock(when.until)}`;
  return text;
}

/**
 * The text with its dates written in full ("@mañana 10" → "@13 oct 2026 10:00"), so that
 * "mañana" doesn't move to the next day tomorrow.
 */
export function completeDates(
  text: string,
  today: DayKey,
  language: 'es' | 'en',
  monthFirst = false,
): string {
  if (!text.includes('@')) return text;
  return text
    .split('\n')
    .map((line) => {
      let out = '';
      let from = 0;
      for (const mark of findDates(line, today, monthFirst)) {
        out += line.slice(from, mark.start) + writeDate(mark, language);
        from = mark.end;
      }
      return out + line.slice(from);
    })
    .join('\n');
}
