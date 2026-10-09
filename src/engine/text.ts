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
}

interface CachedLayout {
  lines: string[];
  paragraphs: number[];
  starts: boolean[];
  widthsRef: number[];
  fullWidthRef: number;
}

const cache = new Map<string, CachedLayout>();

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
  const key = `${faceKey(face)}|${maxRef === undefined ? '-' : maxRef.toFixed(2)}|${text}`;
  let entry = cache.get(key);
  if (!entry) {
    const ctx = measurer(face);
    const lines: string[] = [];
    const paragraphs: number[] = [];
    const starts: boolean[] = [];
    text.split('\n').forEach((paragraph, index) => {
      const wrapped = maxRef === undefined ? [paragraph] : wrapParagraph(ctx, paragraph, maxRef);
      wrapped.forEach((line, i) => {
        lines.push(line);
        paragraphs.push(index);
        starts.push(i === 0);
      });
    });
    // Trailing spaces don't count for alignment (as in CSS), but they take up room while
    // typing.
    const widthsRef = lines.map((line) => ctx.measureText(line.trimEnd()).width);
    const fullWidthRef = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    entry = { lines, paragraphs, starts, widthsRef, fullWidthRef };
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
  };
}

function wrapParagraph(ctx: CanvasRenderingContext2D, paragraph: string, max: number): string[] {
  if (paragraph === '') return [''];
  const lines: string[] = [];
  let line = '';
  for (const token of paragraph.split(/(\s+)/)) {
    if (token === '') continue;
    // Spaces "hang" at the end of the line: they never cause a break.
    if (/^\s+$/.test(token)) {
      line += token;
      continue;
    }
    if (ctx.measureText((line + token).trimEnd()).width <= max) {
      line += token;
      continue;
    }
    if (line.trim() !== '') {
      lines.push(line);
      line = '';
    }
    if (ctx.measureText(token).width <= max) {
      line += token;
      continue;
    }
    // Word longer than the line: it is split by letters.
    for (const ch of token) {
      if (line !== '' && ctx.measureText(line + ch).width > max) {
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
  const underlineFrom = (x: number, y: number, text: string) => {
    const lead = ctx.measureText(text.slice(0, text.length - text.trimStart().length)).width;
    const width = ctx.measureText(text.trim()).width;
    if (width > 0) ctx.fillRect(x + lead, y + REF * 0.1, width, REF * (face.bold ? 0.075 : 0.055));
  };
  layout.lines.forEach((line, i) => {
    const x = ((boxWidth - layout.lineWidths[i]) * factor) / k;
    const y = i * lineHeight + baseline;
    const task = layout.starts[i] ? TASK.exec(line) : null;
    if (!task) {
      ctx.fillText(line, x, y);
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
    ctx.fillText(rest, restX, y);
    if (underline) underlineFrom(restX, y, rest);
    if (checked && rest.trim()) {
      const lead = ctx.measureText(rest.slice(0, rest.length - rest.trimStart().length)).width;
      const width = ctx.measureText(rest.trim()).width;
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
