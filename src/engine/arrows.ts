import { isClosedStroke } from './containers';
import {
  localBounds,
  toLocal,
  toWorld,
  type ArrowBinding,
  type ArrowElement,
  type SceneElement,
} from './elements';
import { arrowControl, arrowEnd, arrowStart } from './arrowGeometry';
import { pointInPolygon } from './geometry';
import type { Vec } from './math';

export * from './arrowGeometry';

/** Gap between the arrowhead and the edge of what it connects. */
const GAP = 10;

// ─── Attaching to other elements ──────────────────────────────

/** Can an arrow be attached to it? Notes, texts, images, shapes and closed strokes. */
export function canBind(el: SceneElement): boolean {
  if (el.type === 'arrow') return false;
  if (el.type === 'stroke') return isClosedStroke(el);
  return true;
}

/** Outline of the element in the world (a polygon). */
function outline(el: SceneElement): Vec[] {
  if (el.type === 'stroke') {
    const polygon: Vec[] = [];
    for (let i = 0; i < el.points.length; i += 3) {
      polygon.push(toWorld(el, { x: el.points[i], y: el.points[i + 1] }));
    }
    return polygon;
  }
  const b = localBounds(el);
  if (el.type === 'shape' && el.shape === 'ellipse') {
    const rx = (b.maxX - b.minX) / 2;
    const ry = (b.maxY - b.minY) / 2;
    return Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return toWorld(el, { x: b.minX + rx + Math.cos(a) * rx, y: b.minY + ry + Math.sin(a) * ry });
    });
  }
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ].map((p) => toWorld(el, p));
}

/** Is the point inside the element (or within `tolerance` of its edge)? */
export function insideForBinding(el: SceneElement, p: Vec, tolerance: number): boolean {
  if (el.type === 'stroke') return pointInPolygon(p, outline(el));
  const local = toLocal(el, p);
  const b = localBounds(el);
  return (
    local.x >= b.minX - tolerance &&
    local.x <= b.maxX + tolerance &&
    local.y >= b.minY - tolerance &&
    local.y <= b.maxY + tolerance
  );
}

/** Point the arrow aims at, relative to the element's box (0 to 1 on each axis). */
export function focusFor(el: SceneElement, p: Vec): Vec {
  const b = localBounds(el);
  const local = toLocal(el, p);
  const fx = (local.x - b.minX) / (b.maxX - b.minX || 1);
  const fy = (local.y - b.minY) / (b.maxY - b.minY || 1);
  // Near the center, to the center: arrows between ideas stay tidy.
  if (Math.hypot(fx - 0.5, fy - 0.5) < 0.3) return { x: 0.5, y: 0.5 };
  return { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
}

export function focusPoint(el: SceneElement, focus: Vec): Vec {
  const b = localBounds(el);
  return toWorld(el, {
    x: b.minX + (b.maxX - b.minX) * focus.x,
    y: b.minY + (b.maxY - b.minY) * focus.y,
  });
}

/** First point where the segment `from` → `to` enters the polygon. */
function entryPoint(polygon: Vec[], from: Vec, to: Vec): Vec | null {
  let best = Infinity;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denom;
    const u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best === Infinity ? null : { x: from.x + dx * best, y: from.y + dy * best };
}

/** The end stays on the element's edge, slightly apart, facing `from`. */
function edgePoint(target: SceneElement, focus: Vec, from: Vec, gap: number): Vec {
  const aim = focusPoint(target, focus);
  const hit = entryPoint(outline(target), from, aim);
  if (!hit) return aim;
  const len = Math.hypot(hit.x - from.x, hit.y - from.y);
  if (len <= gap) return hit;
  return { x: hit.x - ((hit.x - from.x) / len) * gap, y: hit.y - ((hit.y - from.y) / len) * gap };
}

/**
 * Repositions the attached ends: each one stays on its element's edge, pointing at the
 * other end (or at the curve). If the element isn't there (deleted, or on another page if
 * the arrow is on the desk), the end stays where it was without detaching: it follows it
 * again when it reappears (when undoing or going back to that page).
 */
export function routeArrow(
  arrow: ArrowElement,
  get: (id: string) => SceneElement | undefined,
): ArrowElement {
  const targetOf = (binding: ArrowBinding | null) => {
    const el = binding ? get(binding.elementId) : undefined;
    return el && canBind(el) ? el : undefined;
  };
  const startTarget = targetOf(arrow.start);
  const endTarget = targetOf(arrow.end);
  let start = arrowStart(arrow);
  let end = arrowEnd(arrow);
  if (startTarget || endTarget) {
    const refStart = startTarget ? focusPoint(startTarget, arrow.start!.focus) : start;
    const refEnd = endTarget ? focusPoint(endTarget, arrow.end!.focus) : end;
    const control = arrowControl(refStart, refEnd, arrow.bend);
    const gap = GAP + arrow.size;
    if (startTarget) {
      start = edgePoint(startTarget, arrow.start!.focus, arrow.bend ? control : refEnd, gap);
    }
    if (endTarget) {
      end = edgePoint(endTarget, arrow.end!.focus, arrow.bend ? control : refStart, gap);
    }
  }
  return {
    ...arrow,
    x: start.x,
    y: start.y,
    rotation: 0,
    points: [0, 0, 0, end.x - start.x, end.y - start.y, 0],
  };
}

/** Places an arrow's ends (world), keeping the rest. */
export function withEnds(arrow: ArrowElement, start: Vec, end: Vec): ArrowElement {
  return {
    ...arrow,
    x: start.x,
    y: start.y,
    rotation: 0,
    points: [0, 0, 0, end.x - start.x, end.y - start.y, 0],
  };
}

const sameBinding = (a: ArrowBinding | null, b: ArrowBinding | null) =>
  a === b ||
  (!!a && !!b && a.elementId === b.elementId && a.focus.x === b.focus.x && a.focus.y === b.focus.y);

/** Did anything in the arrow change when repositioning it? (to avoid extra writes) */
export function arrowMoved(a: ArrowElement, b: ArrowElement): boolean {
  const close = (u: number, v: number) => Math.abs(u - v) < 1e-6;
  return (
    !close(a.x, b.x) ||
    !close(a.y, b.y) ||
    a.points.some((v, i) => !close(v, b.points[i])) ||
    !sameBinding(a.start, b.start) ||
    !sameBinding(a.end, b.end)
  );
}

/**
 * When arrows are moved (or scaled) without what they connect, they detach: otherwise
 * they would stick back to their elements.
 */
export function detachMoved(el: SceneElement, moving: ReadonlySet<string>): SceneElement {
  if (el.type !== 'arrow') return el;
  const keep = (b: ArrowBinding | null) => (b && moving.has(b.elementId) ? b : null);
  const start = keep(el.start);
  const end = keep(el.end);
  return start === el.start && end === el.end ? el : { ...el, start, end };
}
