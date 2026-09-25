/** Ayudas del editor de texto: sangría con Tab y listas que continúan solas. */

export interface TextEdit {
  value: string;
  /** Selección tras el cambio. */
  start: number;
  end: number;
}

const INDENT = '    ';
/** Viñeta al principio de la línea: "- ", "• ", "* ", "1. ", "2) ", "[ ] ", "[x] ". */
const LIST_ITEM = /^(\s*)([-•*]|\d+[.)]|\[[ xX]\])(\s+)/;

const lineStartOf = (value: string, index: number) => value.lastIndexOf('\n', index - 1) + 1;

function lineEndOf(value: string, index: number) {
  const end = value.indexOf('\n', index);
  return end === -1 ? value.length : end;
}

/** La viñeta de la línea siguiente: los números cuentan y las casillas salen vacías. */
function nextMarker(marker: string): string {
  const number = /^(\d+)([.)])$/.exec(marker);
  if (number) return `${Number(number[1]) + 1}${number[2]}`;
  if (marker.startsWith('[')) return '[ ]';
  return marker;
}

/**
 * Enter dentro de una lista: la línea nueva empieza con la siguiente viñeta. En una
 * viñeta vacía, Enter termina la lista (quita la viñeta). Fuera de listas, null.
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
 * Tab: en una lista (o con varias líneas seleccionadas) mete las líneas hacia dentro;
 * si no, añade un espaciado donde está el cursor. Shift+Tab las saca hacia fuera.
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
 * "[]" y espacio al principio de una línea: se convierte en una tarea ("[ ] "), que se
 * pinta como una casilla. Si no, null.
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
