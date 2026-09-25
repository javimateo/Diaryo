import type { ArrowElement } from './elements';
import type { Bounds } from './geometry';
import type { Vec } from './math';

/** Segments that approximate the curve (for drawing, hit testing and framing). */
const SEGMENTS = 24;

export const arrowStart = (el: ArrowElement): Vec => ({
  x: el.x + el.points[0],
  y: el.y + el.points[1],
});

export const arrowEnd = (el: ArrowElement): Vec => ({
  x: el.x + el.points[3],
  y: el.y + el.points[4],
});

/**
 * Control point of the (quadratic) curve that moves the arrow's middle `bend` away from
 * the straight line between the ends (to the left, looking towards the end).
 */
export function arrowControl(start: Vec, end: Vec, bend: number): Vec {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len === 0 || bend === 0) return mid;
  const nx = (start.y - end.y) / len;
  const ny = (end.x - start.x) / len;
  return { x: mid.x + nx * bend * 2, y: mid.y + ny * bend * 2 };
}

/** Visible middle of the arrow (where the handle to curve it is). */
export function arrowMidpoint(el: ArrowElement): Vec {
  return quadratic(arrowStart(el), arrowControlOf(el), arrowEnd(el), 0.5);
}

export const arrowControlOf = (el: ArrowElement) =>
  arrowControl(arrowStart(el), arrowEnd(el), el.bend);

function quadratic(a: Vec, c: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/** Points along the arrow, in the world. */
export function arrowPath(el: ArrowElement): Vec[] {
  const a = arrowStart(el);
  const b = arrowEnd(el);
  if (el.bend === 0) return [a, b];
  const c = arrowControlOf(el);
  return Array.from({ length: SEGMENTS + 1 }, (_, i) => quadratic(a, c, b, i / SEGMENTS));
}

/** The arrow's box in its coordinates (relative to x, y), with the curve and the width. */
export function arrowLocalBounds(el: ArrowElement): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of arrowPath(el)) {
    minX = Math.min(minX, p.x - el.x);
    minY = Math.min(minY, p.y - el.y);
    maxX = Math.max(maxX, p.x - el.x);
    maxY = Math.max(maxY, p.y - el.y);
  }
  const pad = el.size / 2 + headLength(el) / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Arrowhead length: it grows with the width, but it is never tiny. */
export const headLength = (el: { size: number }) => Math.max(el.size * 5, 16);

/** Direction in which the arrow reaches each end (to orient the arrowheads). */
export function arrowTangents(el: ArrowElement): { start: Vec; end: Vec } {
  const a = arrowStart(el);
  const b = arrowEnd(el);
  const c = el.bend === 0 ? null : arrowControlOf(el);
  const norm = (v: Vec) => {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  };
  return {
    start: norm({ x: a.x - (c ?? b).x, y: a.y - (c ?? b).y }),
    end: norm({ x: b.x - (c ?? a).x, y: b.y - (c ?? a).y }),
  };
}
