import { addDays, dayKey, parseDay, type DayKey } from '../lib/dates';

/** Without case or accents, to compare ("Mañana" → "manana"). */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Words of a search, already normalized. */
export function queryWords(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** Are all the words in the text (ignoring accents and case)? */
export function matchesAll(text: string, words: string[]): boolean {
  const haystack = normalize(text);
  return words.every((word) => haystack.includes(word));
}

/**
 * Does some word of the text start with each of the searched ones? For short names
 * (actions, titles): "lap" finds "Lápiz", but "caja" doesn't find "encajar".
 */
export function matchesPrefixes(text: string, words: string[]): boolean {
  const own = normalize(text).split(/[^\p{L}\p{N}]+/u);
  return words.every((word) => own.some((w) => w.startsWith(word)));
}

/** A piece of text with the matches marked. */
export interface Snippet {
  text: string;
  /** What matches the search: [start, end) within `text`, in order. */
  marks: [number, number][];
}

/** Normalizes while remembering which original character each one comes from. */
function normalizeMapped(text: string) {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = normalize(text[i]);
    for (let k = 0; k < piece.length; k++) map.push(i);
    out += piece;
  }
  return { out, map };
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** How much text is kept before the match. */
const LEAD = 28;
/** Maximum length of the piece (then it is cut with "…" when drawn if it doesn't fit). */
const LENGTH = 160;

/**
 * Searches the words in a text. If all of them are there, returns the piece starting a
 * bit before the first match, on a single line and with the matches marked.
 */
export function findInText(text: string, words: string[]): Snippet | null {
  if (words.length === 0) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  const { out, map } = normalizeMapped(flat);
  const ranges: [number, number][] = [];
  for (const word of words) {
    let at = out.indexOf(word);
    if (at < 0) return null;
    while (at >= 0) {
      ranges.push([map[at], map[at + word.length - 1] + 1]);
      at = out.indexOf(word, at + word.length);
    }
  }
  const marks = mergeRanges(ranges);
  const first = marks[0][0];
  // Start at a whole word, a bit before the match.
  let start = Math.max(0, first - LEAD);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space >= 0 && space < first ? space + 1 : first;
  }
  const end = Math.min(flat.length, start + LENGTH);
  const prefix = start > 0 ? '…' : '';
  const shift = prefix.length - start;
  return {
    text: prefix + flat.slice(start, end) + (end < flat.length ? '…' : ''),
    marks: marks
      .filter(([a, b]) => b > start && a < end)
      .map(([a, b]) => [Math.max(a, start) + shift, Math.min(b, end) + shift]),
  };
}

// ─── Dates typed by hand ("ayer", "lunes", "24 sept", "24/9") ─────────────

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

/** Weekday (0 = Sunday) by its name in Spanish or in English. */
const weekdayOf = (name: string) =>
  WEEKDAYS.includes(name) ? WEEKDAYS.indexOf(name) : WEEKDAYS_EN.indexOf(name);

function day(year: number, month: number, date: number): DayKey | null {
  if (month < 0 || month > 11 || date < 1) return null;
  if (date > new Date(year, month + 1, 0).getDate()) return null;
  return dayKey(new Date(year, month, date, 12));
}

const WEEKDAY = `(${[...WEEKDAYS, ...WEEKDAYS_EN].join('|')})`;
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
 * null if it isn't a day.
 */
export function parseDayQuery(query: string, today: DayKey, monthFirst = false): DayKey | null {
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
    const back = (current - target + 7) % 7;
    return addDays(today, previous ? -(back || 7) : -back);
  }

  // "jueves 24…", "Thursday, September 24": the weekday is redundant.
  q = q.replace(new RegExp(`^${WEEKDAY} (?=\\d|[a-z])`), '');
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q);
  if (iso) return day(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const year = (text: string | undefined) => {
    if (!text) return now.getFullYear();
    return text.length === 2 ? 2000 + Number(text) : Number(text);
  };
  const numeric = NUMERIC_QUERY.exec(q);
  if (numeric) {
    if (!numeric[2]) return day(now.getFullYear(), now.getMonth(), Number(numeric[1]));
    const [a, b] = [Number(numeric[1]), Number(numeric[2])];
    const [date, month] = monthFirst ? [b, a] : [a, b];
    return day(year(numeric[3]), month - 1, date);
  }
  const written = WRITTEN_QUERY.exec(q);
  if (written) return day(year(written[3]), monthOf(written[2]), Number(written[1]));
  const monthFirstWritten = MONTH_FIRST_QUERY.exec(q);
  if (monthFirstWritten) {
    const [, month, date, y] = monthFirstWritten;
    return day(year(y), monthOf(month), Number(date));
  }
  return null;
}
