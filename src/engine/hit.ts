import { arrowPath } from './arrowGeometry';
import { isClosedStroke } from './containers';
import { isBox, toLocal, toWorld, type SceneElement } from './elements';
import { pointInPolygon, segmentSegmentDistanceSq } from './geometry';
import type { Vec } from './math';
import { shapeHitsPoint } from './shapes';
import { strokeHitsSegment } from './strokes';

/**
 * ¿El segmento `a`–`b` (mundo) toca el elemento, con un margen `radius`? Sirve para
 * el clic (a = b), el borrador y el cursor.
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
    // Un trazo cerrado con fondo o texto se puede coger por dentro.
    if ((el.fill || el.label?.text) && isClosedStroke(el)) {
      const polygon: Vec[] = [];
      for (let i = 0; i < el.points.length; i += 3) {
        polygon.push({ x: el.points[i], y: el.points[i + 1] });
      }
      return pointInPolygon(toLocal(el, a), polygon);
    }
    return false;
  }
  // Una figura se coge por el borde (o por dentro si tiene fondo o texto).
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
 * Puntos repartidos sobre el elemento (mundo) para decidir si el lazo lo rodea:
 * a lo largo del trazo, o una rejilla de 3 × 3 sobre las cajas.
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
 * Puntos a distancias iguales a lo largo de un trazo (coordenadas locales). Así cuenta
 * la longitud, no cuántos vértices tiene cada tramo.
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
