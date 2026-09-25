import type { TextAlign } from './elements';
import { DEFAULT_FONT, fonts } from './fonts';

/**
 * Maquetación y dibujo de texto. Se mide y se pinta siempre a un tamaño de
 * referencia y luego se escala: así el resultado es idéntico a cualquier zoom
 * (incluso con letras diminutas en el mundo) y coincide con el <textarea> de edición.
 */
const REF = 100;
export const LINE_HEIGHT = 1.25;

export const fontAt = (px: number, font: string = DEFAULT_FONT) =>
  `400 ${px}px ${fonts.stack(font)}`;

/** Margen interior de una nota respecto a su anchura. */
export const NOTE_PADDING_RATIO = 0.08;

let measureCtx: CanvasRenderingContext2D | null = null;

function measurer(font: string): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  measureCtx.font = fontAt(REF, font);
  return measureCtx;
}

interface Metrics {
  ascent: number;
  descent: number;
}

const metricsCache = new Map<string, Metrics>();

function fontMetrics(font: string): Metrics {
  let metrics = metricsCache.get(font);
  if (!metrics) {
    const m = measurer(font).measureText('Hg');
    metrics = {
      ascent: m.fontBoundingBoxAscent ?? REF * 0.97,
      descent: m.fontBoundingBoxDescent ?? REF * 0.24,
    };
    metricsCache.set(font, metrics);
  }
  return metrics;
}

export interface TextLayout {
  lines: string[];
  /** De qué línea del texto original (separadas por saltos de línea) sale cada una. */
  paragraphs: number[];
  /** La línea es la primera de su párrafo (no la continuación de un ajuste). */
  starts: boolean[];
  /** Anchura de cada línea, en unidades del mundo. */
  lineWidths: number[];
  /** Anchura (con espacios finales) y altura del bloque en unidades del mundo. */
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

/** Olvida las medidas (p. ej. cuando termina de cargar una fuente). */
export function clearTextCache() {
  cache.clear();
  metricsCache.clear();
}

/**
 * Parte el texto en líneas. Sin `maxWidth` solo se corta en los saltos de línea;
 * con él, además se ajusta por palabras como hace el <textarea> (pre-wrap).
 */
export function layoutText(
  text: string,
  fontSize: number,
  font: string,
  maxWidth?: number,
): TextLayout {
  const k = fontSize / REF;
  const maxRef = maxWidth === undefined ? undefined : maxWidth / k;
  const key = `${font}|${maxRef === undefined ? '-' : maxRef.toFixed(2)}|${text}`;
  let entry = cache.get(key);
  if (!entry) {
    const ctx = measurer(font);
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
    // Los espacios finales no cuentan para alinear (como en CSS), pero sí ocupan sitio
    // mientras se escribe.
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
    // Los espacios "cuelgan" al final de la línea: nunca provocan un salto.
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
    // Palabra más larga que la línea: se parte por letras.
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
 * Pinta un bloque de texto con su esquina superior izquierda en (0, 0), alineando
 * cada línea dentro de `boxWidth`. La línea base se coloca como en CSS (interlineado
 * repartido arriba y abajo) para que el texto no "salte" al terminar de editar.
 */
export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  layout: TextLayout,
  options: { fontSize: number; font: string; color: string; align: TextAlign; boxWidth: number },
) {
  const { fontSize, font, color, align, boxWidth } = options;
  const k = fontSize / REF;
  const { ascent, descent } = fontMetrics(font);
  const lineHeight = REF * LINE_HEIGHT;
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const factor = ALIGN_FACTOR[align];
  ctx.save();
  ctx.scale(k, k);
  ctx.font = fontAt(REF, font);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  layout.lines.forEach((line, i) => {
    const x = ((boxWidth - layout.lineWidths[i]) * factor) / k;
    const y = i * lineHeight + baseline;
    const task = layout.starts[i] ? TASK.exec(line) : null;
    if (!task) {
      ctx.fillText(line, x, y);
      return;
    }
    // Tarea: la casilla en el sitio de "[ ]" y el resto, tachado y más suave si está hecha.
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
    // Igual con "[ ]" que con "[x]": el texto no se mueve al marcar la tarea.
    const restX = box.after;
    ctx.fillText(rest, restX, y);
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

/** Tarea al principio de una línea: "[ ] algo" (por hacer) o "[x] algo" (hecha). */
const TASK = /^(\s*)\[([ xX])\]/;

/** Dónde va la casilla de una tarea (a tamaño de referencia, desde el origen del bloque). */
function taskBox(ctx: CanvasRenderingContext2D, task: RegExpExecArray, x: number, y: number) {
  const start = x + ctx.measureText(task[1]).width;
  const mark = ctx.measureText('[ ]').width;
  const size = REF * 0.58;
  return {
    x: start + (mark - size) / 2,
    y: y - REF * 0.3 - size / 2,
    size,
    /** Dónde sigue el texto de la tarea. */
    after: start + mark,
  };
}

/** Casilla de una tarea: su párrafo en el texto original y su caja (en unidades del mundo). */
export interface TaskBox {
  paragraph: number;
  checked: boolean;
  x: number;
  y: number;
  size: number;
}

/** Las casillas de un bloque de texto, en sus coordenadas (las mismas que `drawTextBlock`). */
export function taskBoxes(
  layout: TextLayout,
  options: { fontSize: number; font: string; align: TextAlign; boxWidth: number },
): TaskBox[] {
  const { fontSize, font, align, boxWidth } = options;
  const k = fontSize / REF;
  const { ascent, descent } = fontMetrics(font);
  const lineHeight = REF * LINE_HEIGHT;
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const ctx = measurer(font);
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

/** Marca o desmarca la tarea de ese párrafo. */
export function toggleTask(text: string, paragraph: number): string {
  const lines = text.split('\n');
  lines[paragraph] = lines[paragraph].replace(TASK, (_, indent: string, mark: string) =>
    mark === ' ' ? `${indent}[x]` : `${indent}[ ]`,
  );
  return lines.join('\n');
}
