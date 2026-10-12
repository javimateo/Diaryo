import type { DayKey } from '../lib/dates';
import { findDates, type DateMark, type DateTone } from '../lib/when';
import type { TextAlign } from './elements';
import { DEFAULT_FONT, fonts } from './fonts';

/**
 * Text layout and drawing. It is always measured and painted at a reference size and then
 * scaled: that way the result is identical at any zoom (even with tiny letters in the
 * world) and matches the editing <textarea>.
 */
const REF = 100;
export const LINE_HEIGHT = 1.25;

/** How the letters look: the font and, for the whole text, bold and italic. */
export interface TextFace {
  font: string;
  bold?: boolean;
  italic?: boolean;
}

/** A font without its own bold or italic gets one made up by the browser. */
export const fontAt = (px: number, face: TextFace = { font: DEFAULT_FONT }) =>
  `${face.italic ? 'italic ' : ''}${face.bold ? 700 : 400} ${px}px ${fonts.stack(face.font)}`;

const faceKey = (face: TextFace) => `${face.font}|${face.bold ? 'b' : ''}${face.italic ? 'i' : ''}`;

/** Inner margin of a note relative to its width. */
export const NOTE_PADDING_RATIO = 0.08;

let measureCtx: CanvasRenderingContext2D | null = null;

function measurer(face: TextFace): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  fonts.loadStyle(face.font, !!face.bold, !!face.italic);
  measureCtx.font = fontAt(REF, face);
  return measureCtx;
}

interface Metrics {
  ascent: number;
  descent: number;
}

const metricsCache = new Map<string, Metrics>();

function fontMetrics(face: TextFace): Metrics {
  const key = faceKey(face);
  let metrics = metricsCache.get(key);
  if (!metrics) {
    const m = measurer(face).measureText('Hg');
    metrics = {
      ascent: m.fontBoundingBoxAscent ?? REF * 0.97,
      descent: m.fontBoundingBoxDescent ?? REF * 0.24,
    };
    metricsCache.set(key, metrics);
  }
  return metrics;
}

export interface TextLayout {
  lines: string[];
  /** Which line of the original text (separated by line breaks) each one comes from. */
  paragraphs: number[];
  /** The line is the first of its paragraph (not the continuation of a wrap). */
  starts: boolean[];
  /** Width of each line, in world units. */
  lineWidths: number[];
  /** Width (with trailing spaces) and height of the block in world units. */
  width: number;
  height: number;
  /** Its dates take the room of their labels (not while it is being written). */
  labelled: boolean;
}

interface CachedLayout {
  lines: string[];
  paragraphs: number[];
  starts: boolean[];
  widthsRef: number[];
  fullWidthRef: number;
  labelled: boolean;
}

const cache = new Map<string, CachedLayout>();

/**
 * The dates of tasks and appointments ("@15 oct 2026 10:00", see `lib/when.ts`), drawn as
 * labels. The labels' words come from outside (the engine has no language).
 */
export interface TextDates {
  today: DayKey;
  monthFirst: boolean;
  /** `task`: the line is a task, open or done (null: an appointment). */
  label(mark: DateMark, task: 'open' | 'done' | null): { text: string; tone: DateTone };
  /** The text with its dates written in full, when editing ends (`completeDates`). */
  complete(text: string): string;
}

let dates: TextDates | null = null;

/** Dates drawn as labels (null: as written). */
export function setTextDates(next: TextDates | null) {
  // The lines depend on the labels' words, which change with the day and the language
  // (and so `monthFirst`), not every minute.
  if (next?.today !== dates?.today || next?.monthFirst !== dates?.monthFirst) clearTextCache();
  dates = next;
}

/** The text in the editor: it is laid out as written, as the <textarea> shows it. */
let inEditor: string | null = null;

export function setTextInEditor(text: string | null) {
  inEditor = text;
}

/** The text with its dates written in full (as is without dates). */
export const completeTextDates = (text: string) => (dates ? dates.complete(text) : text);

const datesIn = (line: string): DateMark[] =>
  dates && line.includes('@') ? findDates(line, dates.today, dates.monthFirst) : [];

/** Forgets the measurements (e.g. when a font finishes loading). */
export function clearTextCache() {
  cache.clear();
  metricsCache.clear();
}

/**
 * Splits the text into lines. Without `maxWidth` it only breaks at line breaks; with it,
 * it also wraps by words like the <textarea> does (pre-wrap).
 */
export function layoutText(
  text: string,
  fontSize: number,
  face: TextFace,
  maxWidth?: number,
): TextLayout {
  const k = fontSize / REF;
  const maxRef = maxWidth === undefined ? undefined : maxWidth / k;
  const labelled = dates !== null && text !== inEditor && text.includes('@');
  const key = `${faceKey(face)}|${maxRef === undefined ? '-' : maxRef.toFixed(2)}|${labelled ? '@' : ''}|${text}`;
  let entry = cache.get(key);
  if (!entry) {
    const ctx = measurer(face);
    const measure = (piece: string) => widthOf(ctx, piece, face, labelled);
    const lines: string[] = [];
    const paragraphs: number[] = [];
    const starts: boolean[] = [];
    text.split('\n').forEach((paragraph, index) => {
      const wrapped =
        maxRef === undefined ? [paragraph] : wrapParagraph(measure, paragraph, maxRef, labelled);
      wrapped.forEach((line, i) => {
        lines.push(line);
        paragraphs.push(index);
        starts.push(i === 0);
      });
    });
    // Trailing spaces don't count for alignment (as in CSS), but they take up room while
    // typing.
    const widthsRef = lines.map((line) => measure(line.trimEnd()));
    const fullWidthRef = Math.max(0, ...lines.map(measure));
    entry = { lines, paragraphs, starts, widthsRef, fullWidthRef, labelled };
    if (cache.size > 2000) cache.clear();
    cache.set(key, entry);
  }
  return {
    lines: entry.lines,
    paragraphs: entry.paragraphs,
    starts: entry.starts,
    lineWidths: entry.widthsRef.map((w) => w * k),
    width: entry.fullWidthRef * k,
    height: entry.lines.length * REF * LINE_HEIGHT * k,
    labelled: entry.labelled,
  };
}

function wrapParagraph(
  measure: (text: string) => number,
  paragraph: string,
  max: number,
  labelled: boolean,
): string[] {
  if (paragraph === '') return [''];
  const lines: string[] = [];
  let line = '';
  for (const token of labelled ? wordsOf(paragraph) : paragraph.split(/(\s+)/)) {
    if (token === '') continue;
    // Spaces "hang" at the end of the line: they never cause a break.
    if (/^\s+$/.test(token)) {
      line += token;
      continue;
    }
    if (measure((line + token).trimEnd()) <= max) {
      line += token;
      continue;
    }
    if (line.trim() !== '') {
      lines.push(line);
      line = '';
    }
    if (measure(token) <= max) {
      line += token;
      continue;
    }
    // Word longer than the line: it is split by letters.
    for (const ch of token) {
      if (line !== '' && measure(line + ch) > max) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
  }
  lines.push(line);
  return lines;
}

/** The words and spaces of a paragraph; a date ("@15 oct 2026 10:00") is one word. */
function wordsOf(paragraph: string): string[] {
  const words: string[] = [];
  let from = 0;
  for (const mark of datesIn(paragraph)) {
    words.push(
      ...paragraph.slice(from, mark.start).split(/(\s+)/),
      paragraph.slice(mark.start, mark.end),
    );
    from = mark.end;
  }
  words.push(...paragraph.slice(from).split(/(\s+)/));
  return words;
}

const ALIGN_FACTOR: Record<TextAlign, number> = { left: 0, center: 0.5, right: 1 };

/**
 * Paints a block of text with its top left corner at (0, 0), aligning each line within
 * `boxWidth`. The baseline is placed as in CSS (line spacing split above and below) so
 * the text doesn't "jump" when editing ends.
 */
export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  layout: TextLayout,
  options: {
    fontSize: number;
    face: TextFace;
    color: string;
    align: TextAlign;
    boxWidth: number;
    underline?: boolean;
  },
) {
  const { fontSize, face, color, align, boxWidth, underline } = options;
  const k = fontSize / REF;
  const { ascent, descent } = fontMetrics(face);
  const lineHeight = REF * LINE_HEIGHT;
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const factor = ALIGN_FACTOR[align];
  ctx.save();
  ctx.scale(k, k);
  ctx.font = fontAt(REF, face);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  // The canvas has no underline: a line under the letters, as thick as a stroke of them.
  const measure = (text: string) => widthOf(ctx, text, face, layout.labelled);
  const underlineFrom = (x: number, y: number, text: string) => {
    const lead = measure(text.slice(0, text.length - text.trimStart().length));
    const width = measure(text.trim());
    if (width > 0) ctx.fillRect(x + lead, y + REF * 0.1, width, REF * (face.bold ? 0.075 : 0.055));
  };
  // Whether the paragraph is a task, for the dates of its wrapped lines too.
  let paragraphTask: 'open' | 'done' | null = null;
  layout.lines.forEach((line, i) => {
    const x = ((boxWidth - layout.lineWidths[i]) * factor) / k;
    const y = i * lineHeight + baseline;
    const task = layout.starts[i] ? TASK.exec(line) : null;
    if (layout.starts[i]) paragraphTask = task ? (task[2] !== ' ' ? 'done' : 'open') : null;
    if (!task) {
      fillLine(ctx, line, x, y, face, color, layout.labelled, paragraphTask);
      if (underline) underlineFrom(x, y, line);
      return;
    }
    // Task: the checkbox in place of "[ ]" and the rest, struck through and softer if
    // done.
    const box = taskBox(ctx, task, x, y);
    const checked = task[2] !== ' ';
    ctx.save();
    ctx.lineWidth = REF * 0.075;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.size, box.size, box.size * 0.22);
    ctx.stroke();
    if (checked) {
      ctx.lineWidth = REF * 0.09;
      ctx.beginPath();
      ctx.moveTo(box.x + box.size * 0.22, box.y + box.size * 0.52);
      ctx.lineTo(box.x + box.size * 0.43, box.y + box.size * 0.74);
      ctx.lineTo(box.x + box.size * 0.8, box.y + box.size * 0.26);
      ctx.stroke();
      ctx.globalAlpha *= 0.5;
    }
    const rest = line.slice(task[0].length);
    // Same with "[ ]" as with "[x]": the text doesn't move when ticking the task.
    const restX = box.after;
    fillLine(ctx, rest, restX, y, face, color, layout.labelled, paragraphTask);
    if (underline) underlineFrom(restX, y, rest);
    if (checked && rest.trim()) {
      const lead = measure(rest.slice(0, rest.length - rest.trimStart().length));
      const width = measure(rest.trim());
      ctx.lineWidth = REF * 0.06;
      ctx.beginPath();
      ctx.moveTo(restX + lead, y - REF * 0.3);
      ctx.lineTo(restX + lead + width, y - REF * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();
}

/** A date's label is smaller than the text, with a small clock (or calendar) before it. */
const LABEL_SIZE = REF * 0.78;
/** Its margins, icon and gap, in label sizes. */
const LABEL_PAD = 0.35;
const LABEL_ICON = 0.8;
const LABEL_GAP = 0.3;

const labelFont = (face: TextFace) => fontAt(LABEL_SIZE, { ...face, bold: false });

/** The room of a date's label, at the reference size (`ctx` has the text's font). */
function labelWidth(ctx: CanvasRenderingContext2D, mark: DateMark, face: TextFace): number {
  const font = ctx.font;
  ctx.font = labelFont(face);
  const words = ctx.measureText(dates!.label(mark, null).text).width;
  ctx.font = font;
  return LABEL_SIZE * (LABEL_PAD * 2 + LABEL_ICON + LABEL_GAP) + words;
}

/** Width of some text at the reference size; `labelled`, with its dates as labels. */
function widthOf(ctx: CanvasRenderingContext2D, text: string, face: TextFace, labelled: boolean) {
  if (!labelled) return ctx.measureText(text).width;
  let width = 0;
  let from = 0;
  for (const mark of datesIn(text)) {
    width += ctx.measureText(text.slice(from, mark.start)).width + labelWidth(ctx, mark, face);
    from = mark.end;
  }
  return width + ctx.measureText(text.slice(from)).width;
}

/** Paints a line; `labelled`, with its dates as labels. */
function fillLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  face: TextFace,
  color: string,
  labelled: boolean,
  task: 'open' | 'done' | null,
) {
  let from = 0;
  for (const mark of labelled ? datesIn(line) : []) {
    const before = line.slice(from, mark.start);
    ctx.fillText(before, x, y);
    x += ctx.measureText(before).width;
    drawDateLabel(ctx, dates!.label(mark, task), x, y, face, color, mark);
    x += labelWidth(ctx, mark, face);
    from = mark.end;
  }
  ctx.fillText(line.slice(from), x, y);
}

/** The label's background: terracotta to come, crimson if late, none when gone. */
const TONE_FILL: Record<DateTone, string | null> = {
  soon: 'rgba(214, 120, 90, 0.24)',
  late: 'rgba(214, 51, 108, 0.26)',
  past: null,
};

/** A date's label: a small clock (or calendar, without a time) and its words, in a pill. */
function drawDateLabel(
  ctx: CanvasRenderingContext2D,
  label: { text: string; tone: DateTone },
  x: number,
  y: number,
  face: TextFace,
  color: string,
  mark: DateMark,
) {
  ctx.save();
  ctx.font = labelFont(face);
  const size = LABEL_SIZE;
  const pad = size * LABEL_PAD;
  const icon = size * LABEL_ICON;
  const width = pad * 2 + icon + size * LABEL_GAP + ctx.measureText(label.text).width;
  const height = size * 1.25;
  const middle = y - REF * 0.3;
  ctx.beginPath();
  ctx.roundRect(x, middle - height / 2, width, height, height / 2);
  const fill = TONE_FILL[label.tone];
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  const cx = x + pad + icon / 2;
  const r = icon / 2;
  ctx.beginPath();
  if (mark.time !== undefined) {
    ctx.arc(cx, middle, r, 0, Math.PI * 2);
    ctx.moveTo(cx, middle - r * 0.55);
    ctx.lineTo(cx, middle);
    ctx.lineTo(cx + r * 0.45, middle + r * 0.25);
  } else {
    ctx.roundRect(cx - r, middle - r * 0.85, r * 2, r * 1.85, r * 0.3);
    ctx.moveTo(cx - r, middle - r * 0.25);
    ctx.lineTo(cx + r, middle - r * 0.25);
  }
  ctx.stroke();
  ctx.fillText(label.text, x + pad + icon + size * LABEL_GAP, middle + size * 0.33);
  ctx.restore();
}

/** Task at the start of a line: "[ ] something" (to do) or "[x] something" (done). */
const TASK = /^(\s*)\[([ xX])\]/;

/** Where a task's checkbox goes (at reference size, from the block's origin). */
function taskBox(ctx: CanvasRenderingContext2D, task: RegExpExecArray, x: number, y: number) {
  const start = x + ctx.measureText(task[1]).width;
  const mark = ctx.measureText('[ ]').width;
  const size = REF * 0.58;
  return {
    x: start + (mark - size) / 2,
    y: y - REF * 0.3 - size / 2,
    size,
    /** Where the task's text continues. */
    after: start + mark,
  };
}

/** A task's checkbox: its paragraph in the original text and its box (in world units). */
export interface TaskBox {
  paragraph: number;
  checked: boolean;
  x: number;
  y: number;
  size: number;
}

/** The checkboxes of a text block, in its coordinates (the same as `drawTextBlock`). */
export function taskBoxes(
  layout: TextLayout,
  options: { fontSize: number; face: TextFace; align: TextAlign; boxWidth: number },
): TaskBox[] {
  const { fontSize, face, align, boxWidth } = options;
  const k = fontSize / REF;
  const { ascent, descent } = fontMetrics(face);
  const lineHeight = REF * LINE_HEIGHT;
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const ctx = measurer(face);
  const boxes: TaskBox[] = [];
  layout.lines.forEach((line, i) => {
    const task = layout.starts[i] ? TASK.exec(line) : null;
    if (!task) return;
    const x = ((boxWidth - layout.lineWidths[i]) * ALIGN_FACTOR[align]) / k;
    const box = taskBox(ctx, task, x, i * lineHeight + baseline);
    boxes.push({
      paragraph: layout.paragraphs[i],
      checked: task[2] !== ' ',
      x: box.x * k,
      y: box.y * k,
      size: box.size * k,
    });
  });
  return boxes;
}

/** Ticks or unticks that paragraph's task. */
export function toggleTask(text: string, paragraph: number): string {
  const lines = text.split('\n');
  lines[paragraph] = lines[paragraph].replace(TASK, (_, indent: string, mark: string) =>
    mark === ' ' ? `${indent}[x]` : `${indent}[ ]`,
  );
  return lines.join('\n');
}
