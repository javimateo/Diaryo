import { arrowPath } from './arrowGeometry';
import type { AssetStore } from './assets';
import { isClosedStroke, labelLayout, textOf } from './containers';
import type {
  ContainerElement,
  EditableElement,
  ImageElement,
  NoteElement,
  SceneElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from './elements';
import { drawNoteBody, drawNoteDecoration } from './notes';
import { drawArrow, drawShape, drawStrokeFill } from './shapes';
import { NOTE_INK, resolveColor, type ThemeMode } from './palette';
import { applyElementTransform, drawStroke, strokePath } from './strokes';
import {
  drawTextBlock,
  layoutText,
  LINE_HEIGHT,
  NOTE_PADDING_RATIO,
  type TextLayout,
} from './text';
import type { TextAlign } from './elements';

export interface RenderContext {
  mode: ThemeMode;
  /** Píxeles físicos por unidad del mundo (zoom × densidad de pantalla). */
  pixelScale: number;
  assets: AssetStore;
  /** Elemento que se está editando: su texto lo pinta el <textarea>, no el canvas. */
  editingId: string | null;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: SceneElement,
  rc: RenderContext,
  opacity = 1,
) {
  const alpha = opacity * el.opacity;
  switch (el.type) {
    case 'stroke':
      drawStrokeElement(ctx, el, rc, alpha);
      return;
    case 'shape':
      drawShapeElement(ctx, el, rc, alpha);
      return;
    case 'text':
      drawText(ctx, el, rc, alpha);
      return;
    case 'note':
      drawNote(ctx, el, rc, alpha);
      return;
    case 'image':
      drawImage(ctx, el, rc, alpha);
      return;
    case 'arrow':
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(el.x, el.y);
      drawArrow(ctx, el, rc.mode);
      ctx.restore();
      return;
  }
}

export const notePadding = (note: { width: number }) => note.width * NOTE_PADDING_RATIO;

export interface NoteTextLayout extends TextLayout {
  /** Dónde empieza el texto dentro de la nota (coordenadas de la nota). */
  x: number;
  y: number;
  /** Anchura disponible para el texto. */
  boxWidth: number;
}

/** Posición del texto dentro de una nota, según su alineación vertical. */
export function noteTextLayout(el: NoteElement): NoteTextLayout {
  const pad = notePadding(el);
  const boxWidth = el.width - pad * 2;
  const layout = layoutText(el.text, el.fontSize, el.font, boxWidth);
  const free = Math.max(0, el.height - pad * 2 - layout.height);
  const offset = el.valign === 'middle' ? free / 2 : el.valign === 'bottom' ? free : 0;
  return { ...layout, x: pad, y: pad + offset, boxWidth };
}

export const noteInk = (el: NoteElement, mode: ThemeMode) =>
  el.textColor ? resolveColor(el.textColor, mode) : NOTE_INK;

/** Dónde y cómo va el texto de un elemento: lo usa el editor para colocarse encima. */
export interface EditorBox {
  text: string;
  /** Caja del texto en coordenadas del elemento. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  font: string;
  align: TextAlign;
  color: string;
}

export function editorBox(el: EditableElement, mode: ThemeMode): EditorBox {
  const text = textOf(el);
  if (el.type === 'text') {
    const { fontSize, font, align } = el;
    const color = resolveColor(el.color, mode);
    return { text, x: 0, y: 0, width: el.width, height: el.height, fontSize, font, align, color };
  }
  if (el.type === 'note') {
    const l = noteTextLayout(el);
    const height = Math.max(l.height, el.fontSize * LINE_HEIGHT);
    const { fontSize, font, align } = el;
    return {
      text,
      x: l.x,
      y: l.y,
      width: l.boxWidth,
      height,
      fontSize,
      font,
      align,
      color: noteInk(el, mode),
    };
  }
  // Figuras: al editar siempre tienen etiqueta (el motor les pone una vacía).
  const label = el.label!;
  const l = labelLayout(el, label);
  return {
    text,
    x: l.x,
    y: l.y,
    width: l.boxWidth,
    height: Math.max(l.height, label.fontSize * LINE_HEIGHT),
    fontSize: label.fontSize,
    font: label.font,
    align: label.align,
    color: resolveColor(el.color, mode),
  };
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  rc: RenderContext,
  opacity: number,
) {
  if (rc.editingId === el.id) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  applyElementTransform(ctx, el);
  drawTextBlock(ctx, layoutText(el.text, el.fontSize, el.font, el.wrap ? el.width : undefined), {
    fontSize: el.fontSize,
    font: el.font,
    color: resolveColor(el.color, rc.mode),
    align: el.align,
    boxWidth: el.width,
  });
  ctx.restore();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  el: NoteElement,
  rc: RenderContext,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  applyElementTransform(ctx, el);
  drawNoteBody(ctx, el, rc.mode, rc.pixelScale);

  if (rc.editingId !== el.id) {
    const layout = noteTextLayout(el);
    ctx.save();
    ctx.translate(layout.x, layout.y);
    drawTextBlock(ctx, layout, {
      fontSize: el.fontSize,
      font: el.font,
      color: noteInk(el, rc.mode),
      align: el.align,
      boxWidth: layout.boxWidth,
    });
    ctx.restore();
  }
  // Chincheta, celo o clip van por encima del texto.
  drawNoteDecoration(ctx, el, rc.mode, rc.pixelScale);
  ctx.restore();
}

function drawStrokeElement(
  ctx: CanvasRenderingContext2D,
  el: StrokeElement,
  rc: RenderContext,
  opacity: number,
) {
  const closed = (el.fill || el.label) && isClosedStroke(el);
  if (closed && el.fill) {
    ctx.save();
    ctx.globalAlpha = opacity;
    applyElementTransform(ctx, el);
    drawStrokeFill(ctx, el, rc.mode);
    ctx.restore();
  }
  drawStroke(ctx, el, rc.mode, opacity);
  if (closed) drawLabel(ctx, el, rc, opacity);
}

function drawShapeElement(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  rc: RenderContext,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  applyElementTransform(ctx, el);
  drawShape(ctx, el, rc.mode);
  ctx.restore();
  drawLabel(ctx, el, rc, opacity);
}

/** Texto dentro de una figura: del color del trazo. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  el: ContainerElement,
  rc: RenderContext,
  opacity: number,
) {
  const label = el.label;
  if (!label || !label.text || rc.editingId === el.id) return;
  const layout = labelLayout(el, label);
  ctx.save();
  ctx.globalAlpha = opacity;
  applyElementTransform(ctx, el);
  ctx.translate(layout.x, layout.y);
  drawTextBlock(ctx, layout, {
    fontSize: label.fontSize,
    font: label.font,
    color: resolveColor(el.color, rc.mode),
    align: label.align,
    boxWidth: layout.boxWidth,
  });
  ctx.restore();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  rc: RenderContext,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  applyElementTransform(ctx, el);
  const image = rc.assets.image(el.assetId);
  if (image) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, el.width, el.height);
  } else {
    // Mientras carga, un hueco del mismo tamaño.
    ctx.fillStyle = rc.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, el.width, el.height);
  }
  ctx.restore();
}

/** Contorno fino de un elemento (selección o elemento bajo el cursor). */
export function drawElementOutline(
  ctx: CanvasRenderingContext2D,
  el: SceneElement,
  zoom: number,
  color: string,
  alpha = 1,
) {
  ctx.save();
  applyElementTransform(ctx, el);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / zoom;
  ctx.lineJoin = 'round';
  if (el.type === 'stroke') ctx.stroke(strokePath(el));
  else if (el.type === 'arrow') {
    ctx.beginPath();
    arrowPath(el).forEach((p, i) =>
      i ? ctx.lineTo(p.x - el.x, p.y - el.y) : ctx.moveTo(p.x - el.x, p.y - el.y),
    );
    ctx.stroke();
  } else if (el.type === 'shape' && el.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else ctx.strokeRect(0, 0, el.width, el.height);
  ctx.restore();
}
