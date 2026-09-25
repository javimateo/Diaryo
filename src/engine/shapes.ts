import { arrowControlOf, arrowTangents, headLength } from './arrowGeometry';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable } from 'roughjs/bin/core';
import type { ArrowElement, FillStyle, ShapeElement, StrokeElement } from './elements';
import type { Vec } from './math';
import { resolveColor, resolveNoteColor, type NoteFill, type ThemeMode } from './palette';

const generator = rough.generator();

/** Un RoughCanvas por canvas (el de la escena, el de encima y los de exportar). */
const roughCanvases = new WeakMap<HTMLCanvasElement, RoughCanvas>();

function roughFor(ctx: CanvasRenderingContext2D): RoughCanvas {
  let rc = roughCanvases.get(ctx.canvas);
  if (!rc) {
    rc = rough.canvas(ctx.canvas);
    roughCanvases.set(ctx.canvas, rc);
  }
  return rc;
}

/**
 * Las figuras se generan una vez y se reutilizan: moverlas no cambia su forma. La
 * clave recoge todo lo que afecta al dibujo.
 */
const cache = new Map<string, Drawable>();

function cached(key: string, make: () => Drawable): Drawable {
  let drawable = cache.get(key);
  if (!drawable) {
    drawable = make();
    if (cache.size > 3000) cache.clear();
    cache.set(key, drawable);
  }
  return drawable;
}

function fillOptions(fill: NoteFill | null, fillStyle: FillStyle, weight: number, mode: ThemeMode) {
  if (!fill) return {};
  const color = resolveNoteColor(fill, mode);
  return {
    fill: color,
    fillStyle,
    fillWeight: weight,
    hachureGap: weight * 6,
    // En tema oscuro, los rayados en pastel se ven mejor algo más gruesos.
    ...(fillStyle !== 'solid' && mode === 'dark' ? { fillWeight: weight * 1.4 } : {}),
  };
}

export function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement, mode: ThemeMode) {
  const { width: w, height: h, strokeWidth, roughness } = el;
  const options: Options = {
    seed: el.seed,
    roughness: roughness * 0.9,
    bowing: roughness,
    stroke: el.border ? resolveColor(el.color, mode) : 'none',
    strokeWidth,
    // Una sola línea salvo en "muy a mano", que repasa el trazo como un boceto.
    disableMultiStroke: roughness < 2,
    preserveVertices: roughness === 0,
    ...fillOptions(el.fill, el.fillStyle, Math.max(strokeWidth / 2, 0.5), mode),
  };
  const key = `${el.shape}|${w}|${h}|${mode}|${JSON.stringify(options)}`;
  const drawable = cached(key, () =>
    el.shape === 'ellipse'
      ? generator.ellipse(w / 2, h / 2, w, h, options)
      : generator.rectangle(0, 0, w, h, options),
  );
  roughFor(ctx).draw(drawable);
}

/** Fondo de un trazo cerrado: se rellena el contorno que dibujó el usuario. */
export function drawStrokeFill(ctx: CanvasRenderingContext2D, el: StrokeElement, mode: ThemeMode) {
  if (!el.fill) return;
  const { points } = el;
  const polygon: [number, number][] = [];
  for (let i = 0; i < points.length; i += 3) polygon.push([points[i], points[i + 1]]);
  const weight = Math.max(el.size / 3, 0.5);
  const options: Options = {
    seed: seedFromId(el.id),
    stroke: 'none',
    // El relleno liso sigue exactamente el trazo; los rayados, un poco a mano.
    roughness: el.fillStyle === 'solid' ? 0 : 0.6,
    ...fillOptions(el.fill, el.fillStyle, weight, mode),
  };
  const last = points.length - 3;
  const key = `stroke-fill|${el.id}|${points.length}|${points[3]}|${points[last]}|${points[last + 1]}|${mode}|${JSON.stringify(options)}`;
  roughFor(ctx).draw(cached(key, () => generator.polygon(polygon, options)));
}

function seedFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) + 1;
}

export const newSeed = () => rough.newSeed();

/**
 * ¿El punto (coordenadas de la figura) está sobre ella? Si tiene fondo o texto,
 * vale cualquier punto de dentro; si no, solo cerca del borde (así se puede hacer
 * clic "a través" de una figura vacía).
 */
export function shapeHitsPoint(el: ShapeElement, p: Vec, tolerance: number): boolean {
  const { width: w, height: h } = el;
  const reach = tolerance + el.strokeWidth / 2;
  // Rellenas, con texto o sin borde (caja invisible): se agarran por dentro.
  const solid = el.fill !== null || !el.border || (el.label?.text ?? '') !== '';
  if (el.shape === 'ellipse') {
    const a = w / 2;
    const b = h / 2;
    const dx = (p.x - a) / a;
    const dy = (p.y - b) / b;
    const r = Math.hypot(dx, dy);
    if (solid && r <= 1) return true;
    // Distancia aproximada al borde de la elipse.
    return Math.abs(r - 1) * Math.min(a, b) <= reach;
  }
  const inside = p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  if (solid && inside) return true;
  const outer = p.x >= -reach && p.x <= w + reach && p.y >= -reach && p.y <= h + reach;
  const deep = p.x > reach && p.x < w - reach && p.y > reach && p.y < h - reach;
  return outer && !deep;
}

/**
 * Flecha "a mano" en coordenadas de la flecha (inicio en su x, y): el trazo (recto o
 * curvo) y sus puntas, con el mismo aspecto que las figuras.
 */
export function drawArrow(ctx: CanvasRenderingContext2D, el: ArrowElement, mode: ThemeMode) {
  const ex = el.points[3];
  const ey = el.points[4];
  const origin = { x: el.x, y: el.y };
  const c = arrowControlOf(el);
  const cx = c.x - origin.x;
  const cy = c.y - origin.y;
  const options: Options = {
    seed: el.seed,
    roughness: el.roughness * 0.8,
    bowing: el.roughness * 0.6,
    stroke: resolveColor(el.color, mode),
    strokeWidth: el.size,
    disableMultiStroke: el.roughness < 2,
    preserveVertices: el.roughness === 0,
  };
  const shaft = el.bend === 0 ? `M0 0 L${ex} ${ey}` : `M0 0 Q${cx} ${cy} ${ex} ${ey}`;
  const tangents = arrowTangents(el);
  const len = headLength(el);
  const heads: string[] = [];
  const head = (tip: Vec, dir: Vec) => {
    const spread = 0.45;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const back = { x: -dir.x * len, y: -dir.y * len };
    const left = { x: back.x * cos - back.y * sin, y: back.x * sin + back.y * cos };
    const right = { x: back.x * cos + back.y * sin, y: -back.x * sin + back.y * cos };
    heads.push(
      `M${tip.x + left.x} ${tip.y + left.y} L${tip.x} ${tip.y} L${tip.x + right.x} ${tip.y + right.y}`,
    );
  };
  if (el.endHead === 'arrow') head({ x: ex, y: ey }, tangents.end);
  if (el.startHead === 'arrow') head({ x: 0, y: 0 }, tangents.start);
  const path = [shaft, ...heads].join(' ');
  const key = `arrow|${path}|${mode}|${JSON.stringify(options)}`;
  roughFor(ctx).draw(cached(key, () => generator.path(path, options)));
}
