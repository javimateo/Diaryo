import {
  localBounds,
  type ContainerElement,
  type EditableElement,
  type Label,
  type StrokeElement,
  type ToolStyles,
} from './elements';
import type { Bounds } from './geometry';
import { layoutText, LINE_HEIGHT, type TextLayout } from './text';

/**
 * A stroke is a closed shape if it ends close to where it started (a circle, a cloud, a
 * hand-drawn rectangle…). Only then does it accept a fill and text inside.
 */
export function isClosedStroke(el: StrokeElement): boolean {
  const { points } = el;
  const n = points.length / 3;
  if (n < 8) return false;
  const b = localBounds(el);
  const diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  const gap = Math.hypot(points[0] - points[(n - 1) * 3], points[1] - points[(n - 1) * 3 + 1]);
  return gap <= Math.max(el.size * 3, diagonal * 0.15);
}

export const isContainer = (el: { type: string }): el is ContainerElement =>
  el.type === 'shape' || el.type === 'stroke';

/** Inner area where a shape's text goes (element coordinates). */
export function containerArea(el: ContainerElement): Bounds {
  if (el.type === 'stroke') {
    const b = localBounds(el);
    const ix = (b.maxX - b.minX) * 0.15;
    const iy = (b.maxY - b.minY) * 0.15;
    return { minX: b.minX + ix, minY: b.minY + iy, maxX: b.maxX - ix, maxY: b.maxY - iy };
  }
  const { width: w, height: h } = el;
  if (el.shape === 'ellipse') {
    // Rectangle inscribed in the ellipse.
    const ix = (w * (1 - Math.SQRT1_2)) / 2;
    const iy = (h * (1 - Math.SQRT1_2)) / 2;
    return { minX: ix, minY: iy, maxX: w - ix, maxY: h - iy };
  }
  const pad = Math.min(w, h) * 0.06 + el.strokeWidth;
  return { minX: pad, minY: pad, maxX: w - pad, maxY: h - pad };
}

export interface LabelLayout extends TextLayout {
  x: number;
  y: number;
  boxWidth: number;
}

/** Position of the text inside the shape, according to its vertical alignment. */
export function labelLayout(el: ContainerElement, label: Label): LabelLayout {
  const area = containerArea(el);
  const boxWidth = Math.max(area.maxX - area.minX, label.fontSize);
  const layout = layoutText(label.text, label.fontSize, label.font, boxWidth);
  const height = Math.max(layout.height, label.fontSize * LINE_HEIGHT);
  const free = area.maxY - area.minY - height;
  const offset = label.valign === 'middle' ? free / 2 : label.valign === 'bottom' ? free : 0;
  return { ...layout, x: area.minX, y: area.minY + offset, boxWidth };
}

/** If the text doesn't fit in a rectangle or an ellipse, the shape grows downwards. */
export function fitContainer<T extends ContainerElement>(el: T): T {
  if (el.type !== 'shape' || !el.label) return el;
  const area = containerArea(el);
  const needed = labelLayout(el, el.label).height;
  const available = area.maxY - area.minY;
  if (needed <= available) return el;
  // The usable area is proportional to the height in the ellipse; fixed in the rectangle.
  const extra = el.shape === 'ellipse' ? (needed - available) / Math.SQRT1_2 : needed - available;
  return { ...el, height: el.height + extra };
}

/** New (empty) text for a shape, with the shape style. */
export function defaultLabel(styles: ToolStyles, zoom: number): Label {
  const { font, labelSize, align, valign } = styles.shape;
  return { text: '', fontSize: labelSize / zoom, font, align, valign };
}

// ─── Uniform access to the text of any editable element ─────────

export function textOf(el: EditableElement): string {
  return el.type === 'text' || el.type === 'note' ? el.text : (el.label?.text ?? '');
}

export function withText<T extends EditableElement>(el: T, text: string): T {
  if (el.type === 'text' || el.type === 'note') return { ...el, text };
  return { ...el, label: el.label ? { ...el.label, text } : null };
}
