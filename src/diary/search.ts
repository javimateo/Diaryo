import { addDays, dayKey, parseDay, type DayKey } from '../lib/dates';

/** Sin mayúsculas ni tildes, para comparar ("Mañana" → "manana"). */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Palabras de una búsqueda, ya normalizadas. */
export function queryWords(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** ¿Están todas las palabras en el texto (sin importar tildes ni mayúsculas)? */
export function matchesAll(text: string, words: string[]): boolean {
  const haystack = normalize(text);
  return words.every((word) => haystack.includes(word));
}

/**
 * ¿Empieza alguna palabra del texto por cada una de las buscadas? Para nombres cortos
 * (acciones, títulos): "lap" encuentra "Lápiz", pero "caja" no encuentra "encajar".
 */
export function matchesPrefixes(text: string, words: string[]): boolean {
  const own = normalize(text).split(/[^\p{L}\p{N}]+/u);
  return words.every((word) => own.some((w) => w.startsWith(word)));
}

/** Trozo de un texto con lo encontrado marcado. */
export interface Snippet {
  text: string;
  /** Lo que coincide con la búsqueda: [inicio, fin) dentro de `text`, en orden. */
  marks: [number, number][];
}

/** Normaliza recordando de qué carácter del original sale cada uno. */
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

/** Cuánto texto se deja antes de lo encontrado. */
const LEAD = 28;
/** Largo máximo del trozo (luego se corta con "…" al pintarlo si no cabe). */
const LENGTH = 160;

/**
 * Busca las palabras en un texto. Si están todas, devuelve el trozo que empieza un poco
 * antes de la primera coincidencia, en una sola línea y con lo encontrado marcado.
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
  // Se empieza en una palabra entera, un poco antes de lo encontrado.
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

// ─── Fechas escritas a mano ("ayer", "lunes", "24 sept", "24/9") ────────────

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
/** En el orden de `Date.getDay()`. */
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const RELATIVE: Record<string, number> = {
  hoy: 0,
  ayer: -1,
  anteayer: -2,
  manana: 1,
  'pasado manana': 2,
};

/** Mes por su nombre o su principio ("sept", "ene"); -1 si no lo es. */
function monthOf(word: string): number {
  if (word === 'set' || word === 'setiembre') return 8;
  if (word.length < 3) return -1;
  return MONTHS.findIndex((month) => month.startsWith(word));
}

function day(year: number, month: number, date: number): DayKey | null {
  if (month < 0 || month > 11 || date < 1) return null;
  if (date > new Date(year, month + 1, 0).getDate()) return null;
  return dayKey(new Date(year, month, date, 12));
}

const WEEKDAY = `(${WEEKDAYS.join('|')})`;
const WEEKDAY_QUERY = new RegExp(
  `^(?:el )?(proximo |siguiente )?${WEEKDAY}( pasado| que viene| proximo| siguiente)?$`,
);
const NUMERIC_QUERY = /^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?)?$/;
const WRITTEN_QUERY = /^(\d{1,2})(?: de)? ([a-z]+)\.?(?:(?: de| del)? (\d{4}))?$/;

/**
 * Entiende un día escrito a mano: "hoy", "ayer", "lunes", "el lunes pasado",
 * "próximo viernes", "24", "24/9", "24/9/2025", "24 sept", "jueves 24 de septiembre de
 * 2025" o "2025-09-24". Sin año, es el de hoy. Devuelve null si no es un día.
 */
export function parseDayQuery(query: string, today: DayKey): DayKey | null {
  let q = normalize(query).trim().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!q) return null;
  if (q in RELATIVE) return addDays(today, RELATIVE[q]);

  const now = parseDay(today);
  const weekday = WEEKDAY_QUERY.exec(q);
  if (weekday) {
    const [, before, name, after] = weekday;
    const target = WEEKDAYS.indexOf(name);
    const current = now.getDay();
    // Sin más, el último que ha habido (hoy si es ese día); "pasado", el anterior a hoy.
    if (before || (after && after !== ' pasado')) {
      return addDays(today, (target - current + 7) % 7 || 7);
    }
    const back = (current - target + 7) % 7;
    return addDays(today, after ? -(back || 7) : -back);
  }

  // "jueves 24…": el día de la semana sobra.
  q = q.replace(new RegExp(`^${WEEKDAY} (?=\\d)`), '');
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q);
  if (iso) return day(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const year = (text: string | undefined) => {
    if (!text) return now.getFullYear();
    return text.length === 2 ? 2000 + Number(text) : Number(text);
  };
  const numeric = NUMERIC_QUERY.exec(q);
  if (numeric) {
    const month = numeric[2] ? Number(numeric[2]) - 1 : now.getMonth();
    return day(year(numeric[3]), month, Number(numeric[1]));
  }
  const written = WRITTEN_QUERY.exec(q);
  if (written) return day(year(written[3]), monthOf(written[2]), Number(written[1]));
  return null;
}
