import { arrowPath } from './arrowGeometry';
import { isClosedStroke } from './containers';
import { isBox, toLocal, toWorld, type SceneElement } from './elements';
import { pointInPolygon, segmentSegmentDistanceSq } from './geometry';
import type { Vec } from './math';
import { shapeHitsPoint } from './shapes';
import { strokeHitsSegment } from './strokes';

/**
 * Does the segment `a`–`b` (world) touch the element, with a `radius` margin? Used for
 * clicks (a = b), the eraser and the cursor.
 */
export function elementHitsSegment(el: SceneElement, a: Vec, b: Vec, radius: number): boolean {
  if (el.type === 'arrow') {
    const path = arrowPath(el);
    const reach = (radius + el.size / 2) ** 2;
    for (let i = 1; i < path.length; i++) {
      if (segmentSegmentDistanceSq(a, b, path[i - 1], path[i]) <= reach) return true;
    }
    return false;
  }
  if (!isBox(el)) {
    if (strokeHitsSegment(el, a, b, radius)) return true;
    // A closed stroke with a fill or text can be grabbed from inside.
    if ((el.fill || el.label?.text) && isClosedStroke(el)) {
      const polygon: Vec[] = [];
      for (let i = 0; i < el.points.length; i += 3) {
        polygon.push({ x: el.points[i], y: el.points[i + 1] });
      }
      return pointInPolygon(toLocal(el, a), polygon);
    }
    return false;
  }
  // A shape is grabbed by its border (or from inside if it has a fill or text).
  if (el.type === 'shape' && a.x === b.x && a.y === b.y) {
    return shapeHitsPoint(el, toLocal(el, a), radius);
  }
  const la = toLocal(el, a);
  const lb = toLocal(el, b);
  const { width: w, height: h } = el;
  const inside = (p: Vec) =>
    p.x >= -radius && p.x <= w + radius && p.y >= -radius && p.y <= h + radius;
  if (inside(la) || inside(lb)) return true;
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentSegmentDistanceSq(la, lb, corners[i], corners[(i + 1) % 4]) <= radius * radius) {
      return true;
    }
  }
  return false;
}

/**
 * Points spread over the element (world) to decide whether the lasso surrounds it: along
 * the stroke, or a 3 × 3 grid over boxes.
 */
export function elementSamples(el: SceneElement, count: number): Vec[] {
  if (isBox(el)) {
    const result: Vec[] = [];
    for (const fx of [0, 0.5, 1]) {
      for (const fy of [0, 0.5, 1])
        result.push(toWorld(el, { x: el.width * fx, y: el.height * fy }));
    }
    return result;
  }
  if (el.type === 'arrow') return arrowPath(el);
  return samplePath(el.points, count).map((p) => toWorld(el, p));
}

/**
 * Points at equal distances along a stroke (local coordinates). That way the length
 * counts, not how many vertices each segment has.
 */
function samplePath(points: number[], count: number): Vec[] {
  const n = points.length / 3;
  if (n === 1) return [{ x: points[0], y: points[1] }];
  const lengths = [0];
  for (let i = 1; i < n; i++) {
    const dx = points[i * 3] - points[i * 3 - 3];
    const dy = points[i * 3 + 1] - points[i * 3 - 2];
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[n - 1];
  if (total === 0) return [{ x: points[0], y: points[1] }];

  const result: Vec[] = [];
  let seg = 1;
  for (let s = 0; s < count; s++) {
    const target = (total * (s + 0.5)) / count;
    while (seg < n - 1 && lengths[seg] < target) seg++;
    const t = (target - lengths[seg - 1]) / (lengths[seg] - lengths[seg - 1] || 1);
    const i = seg * 3;
    result.push({
      x: points[i - 3] + (points[i] - points[i - 3]) * t,
      y: points[i - 2] + (points[i + 1] - points[i - 2]) * t,
    });
  }
  return result;
}
