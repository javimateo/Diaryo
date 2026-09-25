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
 * Caja orientada: el "marco" de la selección. Para un solo elemento gira con él;
 * para varios, está alineada con los ejes.
 */
export interface Box {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}

/** Punto del mundo → coordenadas de la caja (origen en su centro, sin giro). */
export function toBox(box: Box, p: Vec): Vec {
  return rotateVec({ x: p.x - box.cx, y: p.y - box.cy }, -box.rotation);
}

/** Coordenadas de la caja → punto del mundo. */
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
  // Las flechas no se giran: se giran sus extremos.
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

/**
 * Escala un elemento en los ejes de `box`, dejando fijo `anchor` (en coordenadas de
 * la caja).
 */
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
    // Al voltear, la curva cambia de lado.
    const bend = el.bend * Math.sqrt(Math.abs(sx * sy)) * Math.sign(sx * sy || 1);
    return { ...withEnds(el, map(arrowStart(el)), map(arrowEnd(el))), bend } as T;
  }
  return (isBox(el) ? scaleBox(el, box, map, sx, sy) : scaleStroke(el, box, map, sx, sy)) as T;
}

/**
 * Trazos: si la escala es uniforme se conserva el giro del elemento; si no, el giro
 * se "hornea" en los puntos para que el trazo se estire exactamente como se ve.
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
 * Cajas: el centro sigue a la transformación y el tamaño cambia sin voltear ni
 * deformar el contenido. Solo las imágenes alineadas con el marco se estiran en un
 * eje; el texto y las notas siempre escalan proporcionalmente (con su letra).
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
  // Un texto estirado solo a lo ancho se vuelve una caja de ese ancho: el texto se
  // reparte en líneas y la letra no cambia.
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
  // Imágenes y figuras se pueden estirar; texto y notas no se deforman.
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
      // El texto de dentro crece solo si la figura crece en proporción.
      return kx === ky ? { ...el, ...moved, label: scaleLabel(el.label, kx) } : { ...el, ...moved };
    default:
      return { ...el, ...moved, fontSize: el.fontSize * uniform };
  }
}

function scaleLabel(label: Label | null, k: number): Label | null {
  return label && { ...label, fontSize: label.fontSize * k };
}
