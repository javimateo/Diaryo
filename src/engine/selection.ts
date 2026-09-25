import { isClosedStroke } from './containers';
import { elementBounds, toLocal, type ContainerElement, type SceneElement } from './elements';
import { pointInPolygon, type Bounds } from './geometry';

export { pointInPolygon };
import type { Vec } from './math';
import type { Scene } from './scene';
import { elementHitsSegment, elementSamples } from './hit';
import { boxCorners, fromBox, toBox, type Box } from './transform';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type Handle = ResizeHandle | 'rotate';

/** Sizes in screen pixels. */
const HANDLE_SIZE = 9;
const HANDLE_HIT = 7;
const EDGE_HIT = 5;
const ROTATE_OFFSET = 22;
const ROTATE_RADIUS = 5;
/** Below this on-screen size no handles are shown: the frame is only for moving. */
const MIN_HANDLES_SIZE = 16;

/** Direction of each handle in box coordinates (-1, 0 or 1 on each axis). */
export const HANDLE_DIRECTIONS: Record<ResizeHandle, Vec> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

const CORNERS: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGES: ResizeHandle[] = ['n', 'e', 's', 'w'];

export function hasHandles(box: Box, zoom: number): boolean {
  return box.width * zoom >= MIN_HANDLES_SIZE || box.height * zoom >= MIN_HANDLES_SIZE;
}

function rotateHandlePosition(box: Box, zoom: number): Vec {
  return { x: 0, y: -box.height / 2 - ROTATE_OFFSET / zoom };
}

/** Which handle is under the point? First rotation, then corners and finally edges. */
export function hitHandle(box: Box, world: Vec, zoom: number): Handle | null {
  if (!hasHandles(box, zoom)) return null;
  const p = toBox(box, world);
  const w = box.width / 2;
  const h = box.height / 2;

  const r = rotateHandlePosition(box, zoom);
  if (Math.hypot(p.x - r.x, p.y - r.y) <= (ROTATE_RADIUS + 4) / zoom) return 'rotate';

  const tol = HANDLE_HIT / zoom;
  for (const handle of CORNERS) {
    const d = HANDLE_DIRECTIONS[handle];
    if (Math.abs(p.x - d.x * w) <= tol && Math.abs(p.y - d.y * h) <= tol) return handle;
  }

  // Edges can be dragged along their whole length.
  const edgeTol = EDGE_HIT / zoom;
  for (const handle of EDGES) {
    const d = HANDLE_DIRECTIONS[handle];
    if (d.x !== 0 && Math.abs(p.x - d.x * w) <= edgeTol && Math.abs(p.y) <= h) return handle;
    if (d.y !== 0 && Math.abs(p.y - d.y * h) <= edgeTol && Math.abs(p.x) <= w) return handle;
  }
  return null;
}

export function pointInBox(box: Box, world: Vec): boolean {
  const p = toBox(box, world);
  return Math.abs(p.x) <= box.width / 2 && Math.abs(p.y) <= box.height / 2;
}

/** Resize cursor according to the direction of the already rotated handle. */
export function resizeCursor(handle: ResizeHandle, rotation: number): string {
  const d = HANDLE_DIRECTIONS[handle];
  const angle = Math.atan2(d.y, d.x) + rotation;
  const octant = ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][octant];
}

/** Topmost element under the point (with a tolerance in world units). */
export function hitTestElement(
  scene: Scene,
  world: Vec,
  tolerance: number,
  includeLocked = false,
): SceneElement | null {
  const candidates = scene.search({
    minX: world.x - tolerance,
    minY: world.y - tolerance,
    maxX: world.x + tolerance,
    maxY: world.y + tolerance,
  });
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i].locked && !includeLocked) continue;
    if (elementHitsSegment(candidates[i], world, world, tolerance)) return candidates[i];
  }
  return null;
}

/** Is the point (element coordinates) inside the shape? */
function insideContainer(el: ContainerElement, p: Vec): boolean {
  if (el.type === 'stroke') {
    const polygon: Vec[] = [];
    for (let i = 0; i < el.points.length; i += 3) {
      polygon.push({ x: el.points[i], y: el.points[i + 1] });
    }
    return pointInPolygon(p, polygon);
  }
  if (el.shape === 'ellipse') {
    const dx = (p.x - el.width / 2) / (el.width / 2);
    const dy = (p.y - el.height / 2) / (el.height / 2);
    return dx * dx + dy * dy <= 1;
  }
  return p.x >= 0 && p.x <= el.width && p.y >= 0 && p.y <= el.height;
}

/**
 * The topmost shape surrounding the point (even without a fill): to write inside it by
 * double-clicking in its interior or with the text tool.
 */
export function containerAt(scene: Scene, world: Vec): ContainerElement | null {
  const candidates = scene.search({ minX: world.x, minY: world.y, maxX: world.x, maxY: world.y });
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el.locked) continue;
    const container =
      el.type === 'shape' || (el.type === 'stroke' && isClosedStroke(el)) ? el : null;
    if (container && insideContainer(container, toLocal(container, world))) return container;
  }
  return null;
}

/** Elements completely inside the rectangle. */
export function elementsInRect(scene: Scene, rect: Bounds): SceneElement[] {
  return scene.search(rect).filter((el) => {
    if (el.locked) return false;
    const b = elementBounds(el);
    return b.minX >= rect.minX && b.maxX <= rect.maxX && b.minY >= rect.minY && b.maxY <= rect.maxY;
  });
}

/** Share of a stroke's points that must be inside the lasso to select it. */
const LASSO_THRESHOLD = 0.8;
const LASSO_MAX_SAMPLES = 64;

/**
 * Elements surrounded by the lasso. They don't need to be surrounded perfectly: it is
 * enough for most of the stroke to be inside (useful when lassoing handwriting).
 */
export function elementsInLasso(scene: Scene, polygon: Vec[]): SceneElement[] {
  if (polygon.length < 3) return [];
  const bounds = polygon.reduce<Bounds>(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return scene.search(bounds).filter((el) => {
    if (el.locked) return false;
    const samples = elementSamples(el, LASSO_MAX_SAMPLES);
    const inside = samples.filter((p) => pointInPolygon(p, polygon)).length;
    return inside / samples.length >= LASSO_THRESHOLD;
  });
}

// ─── Drawing ──────────────────────────────────────────────────

export interface SelectionColors {
  accent: string;
  handleFill: string;
}

/** Selection frame with its handles. The context has the world transform. */
export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  box: Box,
  zoom: number,
  colors: SelectionColors,
  showHandles: boolean,
) {
  const corners = boxCorners(box);
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();

  if (showHandles && hasHandles(box, zoom)) {
    const size = HANDLE_SIZE / zoom;
    ctx.fillStyle = colors.handleFill;
    ctx.lineWidth = 1.5 / zoom;
    for (const c of corners) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(box.rotation);
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, 2 / zoom);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const r = fromBox(box, rotateHandlePosition(box, zoom));
    ctx.beginPath();
    ctx.arc(r.x, r.y, ROTATE_RADIUS / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
