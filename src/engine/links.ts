import { elementBounds, type SceneElement } from './elements';
import { unionBounds, type Bounds } from './geometry';
import type { Vec } from './math';

/** Etiqueta de un enlace: su texto y si la página existe. */
export interface LinkLabel {
  text: string;
  missing: boolean;
}

/** Medidas de la etiqueta en píxeles de pantalla (no crece ni mengua con el zoom). */
const HEIGHT = 22;
const PADDING = 8;
const FONT_SIZE = 12.5;
const FONT = `600 ${FONT_SIZE}px "Inter Variable", system-ui, sans-serif`;
/** Separación sobre la esquina superior derecha (deja libre el asa de esa esquina). */
const LIFT = 10;
const OUTSET = 4;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = FONT;
  return measureCtx.measureText(text).width;
}

const labelText = (label: LinkLabel) => `→ ${label.text}`;

/** Una etiqueta de enlace en el lienzo: puede representar a varios elementos. */
export interface LinkBadge {
  link: string;
  ids: string[];
  label: LinkLabel;
  rect: Bounds;
}

const overlaps = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * Etiquetas de los enlaces. Lo que lleva a la misma página y está agrupado o
 * superpuesto (una foto sobre un pósit) comparte una sola etiqueta, en la esquina
 * superior derecha del conjunto.
 */
export function linkBadges(
  elements: SceneElement[],
  labelOf: (pageId: string) => LinkLabel,
  zoom: number,
): LinkBadge[] {
  const linked = elements.filter((el) => el.link);
  const bounds = linked.map(elementBounds);
  const parent = linked.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < linked.length; i++) {
    for (let j = i + 1; j < linked.length; j++) {
      const a = linked[i];
      const b = linked[j];
      if (a.link !== b.link) continue;
      const together = (a.groupId && a.groupId === b.groupId) || overlaps(bounds[i], bounds[j]);
      if (together) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, number[]>();
  linked.forEach((_, i) => {
    const root = find(i);
    clusters.set(root, [...(clusters.get(root) ?? []), i]);
  });
  return [...clusters.values()].map((members) => {
    const box = members.map((i) => bounds[i]).reduce(unionBounds);
    const link = linked[members[0]].link!;
    const label = labelOf(link);
    return {
      link,
      ids: members.map((i) => linked[i].id),
      label,
      rect: badgeRect(box, label, zoom),
    };
  });
}

/** Dónde va la etiqueta (mundo): sobre la esquina superior derecha de `box`. */
function badgeRect(box: Bounds, label: LinkLabel, zoom: number): Bounds {
  const width = (textWidth(labelText(label)) + PADDING * 2) / zoom;
  const height = HEIGHT / zoom;
  const maxX = box.maxX + OUTSET / zoom;
  const minY = box.minY - height - LIFT / zoom;
  return { minX: maxX - width, minY, maxX, maxY: minY + height };
}

/** Pinta la etiqueta "→ destino" (el contexto tiene la transformación del mundo). */
export function drawLinkBadge(
  ctx: CanvasRenderingContext2D,
  badge: LinkBadge,
  zoom: number,
  accent: string,
) {
  const { rect: r, label } = badge;
  const k = 1 / zoom;
  ctx.save();
  ctx.globalAlpha = label.missing ? 0.55 : 1;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.roundRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY, (HEIGHT / 2) * k);
  ctx.fillStyle = label.missing ? '#8c877e' : accent;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.translate(r.minX + PADDING * k, (r.minY + r.maxY) / 2);
  ctx.scale(k, k);
  ctx.font = FONT;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText(label), 0, 1);
  ctx.restore();
}

/** Etiqueta bajo el punto (la última dibujada, que queda encima), o null. */
export function badgeAt(badges: LinkBadge[], p: Vec): LinkBadge | null {
  for (let i = badges.length - 1; i >= 0; i--) {
    const r = badges[i].rect;
    if (p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY) return badges[i];
  }
  return null;
}
