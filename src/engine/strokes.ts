import { getStroke, type StrokeOptions } from 'perfect-freehand';
import { toLocal, type StrokeElement, type StrokeKind } from './elements';
import { pointSegmentDistanceSq, segmentSegmentDistanceSq } from './geometry';
import type { Vec } from './math';
import { resolveColor, type Color, type ThemeMode } from './palette';

const BASE_OPTIONS: Record<StrokeKind, StrokeOptions> = {
  pen: {
    thinning: 0.45,
    smoothing: 0.5,
    streamline: 0.4,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  },
  // The highlighter is flat: it doesn't react to pressure.
  marker: {
    thinning: 0,
    smoothing: 0.6,
    streamline: 0.5,
    start: { cap: true },
    end: { cap: true },
  },
};

const MARKER_OPACITY: Record<ThemeMode, number> = { light: 0.4, dark: 0.45 };

export interface StrokeInput {
  kind: StrokeKind;
  points: number[];
  simulatePressure: boolean;
  size: number;
}

function toTriples(points: number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < points.length; i += 3) {
    result.push([points[i], points[i + 1], points[i + 2]]);
  }
  return result;
}

/** Stroke outline as a Path2D, in point coordinates. */
export function buildStrokePath(stroke: StrokeInput, complete: boolean): Path2D {
  const outline = getStroke(toTriples(stroke.points), {
    ...BASE_OPTIONS[stroke.kind],
    size: stroke.size,
    simulatePressure: stroke.kind === 'pen' && stroke.simulatePressure,
    last: complete,
  });
  return outlineToPath(outline);
}

/** Joins the outline points with quadratic curves so the edge is smooth. */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 3) return path;
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(outline[0], outline[1]);
  path.moveTo(start[0], start[1]);
  for (let i = 1; i <= n; i++) {
    const p = outline[i % n];
    const m = mid(p, outline[(i + 1) % n]);
    path.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  path.closePath();
  return path;
}

/**
 * Outline cache per point array: moving or rotating a stroke creates a new element but
 * reuses the same points, so the outline doesn't have to be recomputed.
 */
const pathCache = new WeakMap<number[], { key: string; path: Path2D }>();

export function strokePath(el: StrokeElement): Path2D {
  const key = `${el.kind}|${el.size}|${el.simulatePressure}`;
  const cached = pathCache.get(el.points);
  if (cached?.key === key) return cached.path;
  const path = buildStrokePath(el, true);
  pathCache.set(el.points, { key, path });
  return path;
}

/** Applies the element's position and rotation to the context (which already has the world one). */
export function applyElementTransform(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; rotation: number },
) {
  ctx.translate(el.x, el.y);
  if (el.rotation !== 0) ctx.rotate(el.rotation);
}

/**
 * Prepares the context to paint a stroke. The highlighter blends with "multiply" in the
 * light theme (and "screen" in dark) so it doesn't cover the ink, like a real
 * highlighter.
 */
export function applyStrokePaint(
  ctx: CanvasRenderingContext2D,
  kind: StrokeKind,
  color: Color,
  mode: ThemeMode,
  opacity: number,
) {
  ctx.fillStyle = resolveColor(color, mode);
  if (kind === 'marker') {
    ctx.globalAlpha = opacity * MARKER_OPACITY[mode];
    ctx.globalCompositeOperation = mode === 'light' ? 'multiply' : 'screen';
  } else {
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Draws a finished stroke. The context must have the world transform. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  el: StrokeElement,
  mode: ThemeMode,
  opacity = 1,
) {
  ctx.save();
  applyStrokePaint(ctx, el.kind, el.color, mode, opacity);
  applyElementTransform(ctx, el);
  ctx.fill(strokePath(el));
  ctx.restore();
}

/** Does the segment `a`–`b` (world) pass within `radius` of the stroke? */
export function strokeHitsSegment(el: StrokeElement, a: Vec, b: Vec, radius: number): boolean {
  const reach = radius + el.size / 2;
  const reachSq = reach * reach;
  const { points } = el;
  // We move the segment into stroke coordinates instead of moving all its points.
  const la = toLocal(el, a);
  const lb = toLocal(el, b);

  if (points.length <= 3) {
    return pointSegmentDistanceSq({ x: points[0], y: points[1] }, la, lb) <= reachSq;
  }
  for (let i = 3; i < points.length; i += 3) {
    const p = { x: points[i - 3], y: points[i - 2] };
    const q = { x: points[i], y: points[i + 1] };
    if (segmentSegmentDistanceSq(p, q, la, lb) <= reachSq) return true;
  }
  return false;
}
