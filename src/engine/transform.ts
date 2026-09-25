import { arrowEnd, arrowStart, withEnds } from './arrows';
import { fitText } from './editing';
import {
  elementBounds,
  isBox,
  localBounds,
  toWorld,
  type BoxSceneElement,
  type Label,
  type SceneElement,
  type StrokeElement,
} from './elements';
import { unionBounds } from './geometry';
import { normalizeAngle, rotateAround, rotateVec, type Vec } from './math';

/**
 * Oriented box: the selection "frame". For a single element it rotates with it; for
 * several, it is axis-aligned.
 */
export interface Box {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}

/** World point → box coordinates (origin at its center, without rotation). */
export function toBox(box: Box, p: Vec): Vec {
  return rotateVec({ x: p.x - box.cx, y: p.y - box.cy }, -box.rotation);
}

/** Box coordinates → world point. */
export function fromBox(box: Box, p: Vec): Vec {
  const r = rotateVec(p, box.rotation);
  return { x: r.x + box.cx, y: r.y + box.cy };
}

export function boxCorners(box: Box): Vec[] {
  const w = box.width / 2;
  const h = box.height / 2;
  return [
    fromBox(box, { x: -w, y: -h }),
    fromBox(box, { x: w, y: -h }),
    fromBox(box, { x: w, y: h }),
    fromBox(box, { x: -w, y: h }),
  ];
}

export function selectionBox(elements: SceneElement[]): Box | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) {
    const el = elements[0];
    const b = localBounds(el);
    const center = toWorld(el, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    return {
      cx: center.x,
      cy: center.y,
      width: b.maxX - b.minX,
      height: b.maxY - b.minY,
      rotation: el.rotation,
    };
  }
  const b = elements.map(elementBounds).reduce(unionBounds);
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
    rotation: 0,
  };
}

export function translateElement<T extends SceneElement>(el: T, dx: number, dy: number): T {
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function rotateElement<T extends SceneElement>(el: T, pivot: Vec, angle: number): T {
  // Arrows aren't rotated: their ends are.
  if (el.type === 'arrow') {
    return withEnds(
      el,
      rotateAround(arrowStart(el), pivot, angle),
      rotateAround(arrowEnd(el), pivot, angle),
    ) as T;
  }
  const origin = rotateAround({ x: el.x, y: el.y }, pivot, angle);
  return { ...el, x: origin.x, y: origin.y, rotation: normalizeAngle(el.rotation + angle) };
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Scales an element along the axes of `box`, keeping `anchor` fixed (in box coordinates). */
export function scaleElement<T extends SceneElement>(
  el: T,
  box: Box,
  anchor: Vec,
  sx: number,
  sy: number,
): T {
  const map = (p: Vec): Vec => {
    const f = toBox(box, p);
    return fromBox(box, {
      x: anchor.x + (f.x - anchor.x) * sx,
      y: anchor.y + (f.y - anchor.y) * sy,
    });
  };
  if (el.type === 'arrow') {
    // When flipping, the curve changes side.
    const bend = el.bend * Math.sqrt(Math.abs(sx * sy)) * Math.sign(sx * sy || 1);
    return { ...withEnds(el, map(arrowStart(el)), map(arrowEnd(el))), bend } as T;
  }
  return (isBox(el) ? scaleBox(el, box, map, sx, sy) : scaleStroke(el, box, map, sx, sy)) as T;
}

/**
 * Strokes: if the scale is uniform the element's rotation is kept; otherwise, the
 * rotation is "baked" into the points so the stroke stretches exactly as it looks.
 */
function scaleStroke(
  el: StrokeElement,
  box: Box,
  map: (p: Vec) => Vec,
  sx: number,
  sy: number,
): StrokeElement {
  const origin = map({ x: el.x, y: el.y });
  const size = el.size * Math.sqrt(Math.abs(sx * sy));
  const { points } = el;
  const next: number[] = new Array(points.length);

  if (sx === sy) {
    for (let i = 0; i < points.length; i += 3) {
      next[i] = round(points[i] * sx);
      next[i + 1] = round(points[i + 1] * sy);
      next[i + 2] = points[i + 2];
    }
    return {
      ...el,
      x: origin.x,
      y: origin.y,
      points: next,
      size,
      label: scaleLabel(el.label, Math.abs(sx)),
    };
  }

  for (let i = 0; i < points.length; i += 3) {
    const world = map(toWorld(el, { x: points[i], y: points[i + 1] }));
    const local = rotateVec({ x: world.x - origin.x, y: world.y - origin.y }, -box.rotation);
    next[i] = round(local.x);
    next[i + 1] = round(local.y);
    next[i + 2] = points[i + 2];
  }
  return { ...el, x: origin.x, y: origin.y, rotation: box.rotation, points: next, size };
}

/**
 * Boxes: the center follows the transform and the size changes without flipping or
 * deforming the content. Only images aligned with the frame stretch along one axis; texts
 * and notes always scale proportionally (with their font).
 */
function scaleBox(
  el: BoxSceneElement,
  box: Box,
  map: (p: Vec) => Vec,
  sx: number,
  sy: number,
): BoxSceneElement {
  const center = map(toWorld(el, { x: el.width / 2, y: el.height / 2 }));
  const aligned = Math.abs(normalizeAngle(el.rotation - box.rotation)) < 1e-6;
  // A text stretched only in width becomes a box of that width: the text wraps into lines
  // and the font doesn't change.
  if (el.type === 'text' && aligned && sy === 1 && sx !== 1) {
    const width = Math.max(el.width * Math.abs(sx), el.fontSize);
    const half = rotateVec({ x: width / 2, y: el.height / 2 }, el.rotation);
    return fitText({
      ...el,
      x: center.x - half.x,
      y: center.y - half.y,
      width,
      wrap: true,
    });
  }
  const uniform = Math.sqrt(Math.abs(sx * sy));
  // Images and shapes can be stretched; texts and notes don't deform.
  const stretch = (el.type === 'image' || el.type === 'shape') && aligned;
  const kx = stretch ? Math.abs(sx) : uniform;
  const ky = stretch ? Math.abs(sy) : uniform;
  const width = el.width * kx;
  const height = el.height * ky;
  const half = rotateVec({ x: width / 2, y: height / 2 }, el.rotation);
  const moved = { x: center.x - half.x, y: center.y - half.y, width, height };
  switch (el.type) {
    case 'image':
      return { ...el, ...moved };
    case 'shape':
      // The text inside only grows if the shape grows proportionally.
      return kx === ky ? { ...el, ...moved, label: scaleLabel(el.label, kx) } : { ...el, ...moved };
    default:
      return { ...el, ...moved, fontSize: el.fontSize * uniform };
  }
}

function scaleLabel(label: Label | null, k: number): Label | null {
  return label && { ...label, fontSize: label.fontSize * k };
}
