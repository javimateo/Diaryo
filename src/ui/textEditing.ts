import type { DayKey } from '../lib/dates';
import { findDates, type When } from '../lib/when';

/**
 * Text editor helpers: indentation with Tab, lists that continue by themselves and the
 * date being written after an "@".
 */

export interface TextEdit {
  value: string;
  /** Selection after the change. */
  start: number;
  end: number;
}

const INDENT = '    ';
/** Bullet at the start of the line: "- ", "• ", "* ", "1. ", "2) ", "[ ] ", "[x] ". */
const LIST_ITEM = /^(\s*)([-•*]|\d+[.)]|\[[ xX]\])(\s+)/;

const lineStartOf = (value: string, index: number) => value.lastIndexOf('\n', index - 1) + 1;

function lineEndOf(value: string, index: number) {
  const end = value.indexOf('\n', index);
  return end === -1 ? value.length : end;
}

/** The next line's bullet: numbers count up and checkboxes start empty. */
function nextMarker(marker: string): string {
  const number = /^(\d+)([.)])$/.exec(marker);
  if (number) return `${Number(number[1]) + 1}${number[2]}`;
  if (marker.startsWith('[')) return '[ ]';
  return marker;
}

/**
 * Enter inside a list: the new line starts with the next bullet. On an empty bullet,
 * Enter ends the list (removes the bullet). Outside lists, null.
 */
export function continueList(value: string, start: number, end: number): TextEdit | null {
  const lineStart = lineStartOf(value, start);
  const match = LIST_ITEM.exec(value.slice(lineStart, start));
  if (!match) return null;
  const [prefix, indent, marker, gap] = match;
  const lineEnd = lineEndOf(value, end);
  const content = value.slice(lineStart + prefix.length, lineEnd);
  if (start === end && content.trim() === '') {
    const value2 = value.slice(0, lineStart) + value.slice(lineEnd);
    return { value: value2, start: lineStart, end: lineStart };
  }
  const insert = `\n${indent}${nextMarker(marker)}${gap}`;
  const caret = start + insert.length;
  return { value: value.slice(0, start) + insert + value.slice(end), start: caret, end: caret };
}

/**
 * Tab: in a list (or with several lines selected) indents the lines; otherwise, adds
 * spacing at the cursor. Shift+Tab outdents them.
 */
export function indent(value: string, start: number, end: number, outdent: boolean): TextEdit {
  const first = lineStartOf(value, start);
  const multiline = value.slice(start, end).includes('\n');
  const inList = LIST_ITEM.test(value.slice(first, lineEndOf(value, start)));
  if (!outdent && !multiline && !inList) {
    const caret = start + INDENT.length;
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: caret, end: caret };
  }
  const last = lineEndOf(value, end > start ? end - 1 : end);
  const lines = value.slice(first, last).split('\n');
  let delta = 0;
  let firstDelta = 0;
  const changed = lines.map((line, i) => {
    let next: string;
    if (outdent) {
      const remove = /^ {1,4}|^\t/.exec(line)?.[0].length ?? 0;
      next = line.slice(remove);
    } else {
      next = INDENT + line;
    }
    const diff = next.length - line.length;
    if (i === 0) firstDelta = diff;
    delta += diff;
    return next;
  });
  const value2 = value.slice(0, first) + changed.join('\n') + value.slice(last);
  return {
    value: value2,
    start: Math.max(first, start + firstDelta),
    end: Math.max(first, end + delta),
  };
}

/**
 * "[]" and space at the start of a line: it becomes a task ("[ ] "), drawn as a checkbox.
 * Otherwise, null.
 */
export function taskShortcut(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const lineStart = lineStartOf(value, start);
  const match = /^(\s*)\[\]$/.exec(value.slice(lineStart, start));
  if (!match) return null;
  const insert = `${match[1]}[ ] `;
  const caret = lineStart + insert.length;
  return { value: value.slice(0, lineStart) + insert + value.slice(end), start: caret, end: caret };
}

/** A date being written at the cursor, for the date picker. */
export interface DateInProgress {
  /** Where its "@" is; it goes up to the cursor. */
  start: number;
  /** What is understood so far (null: nothing yet, "@" or "@mañ"). */
  when: When | null;
}

/**
 * The date being written at the cursor: an "@" starting a word, on the same line, followed
 * by a date ("@mañana 10", with a space after it too) or by a word being written ("@mañ").
 * Null if there is none or it was just text ("@Lucía viene").
 */
export function dateInProgress(
  value: string,
  caret: number,
  today: DayKey,
  monthFirst: boolean,
): DateInProgress | null {
  const lineStart = lineStartOf(value, caret);
  const match = /(^|\s)@([^@\n]*)$/.exec(value.slice(lineStart, caret));
  if (!match) return null;
  const start = lineStart + match.index + match[1].length;
  const written = `@${match[2]}`.trimEnd();
  const [mark] = findDates(written, today, monthFirst);
  if (mark?.start === 0 && mark.end === written.length) {
    const { day, time, until } = mark;
    return { start, when: { day, time, until } };
  }
  return /\s/.test(written) ? null : { start, when: null };
}

/**
 * The date being written (from `start` to the cursor) replaced by `date`; with `space`, the
 * cursor goes past a space after it (added if there isn't one).
 */
export function replaceDate(
  value: string,
  start: number,
  caret: number,
  date: string,
  space: boolean,
): TextEdit {
  const after = space && !/^\s/.test(value.slice(caret)) ? ' ' : '';
  const end = start + date.length + (space ? 1 : 0);
  return { value: value.slice(0, start) + date + after + value.slice(caret), start: end, end };
}
