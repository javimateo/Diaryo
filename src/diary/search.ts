import { normalize } from '../lib/when';

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
