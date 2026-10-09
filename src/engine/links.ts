import { elementBounds, type SceneElement } from './elements';
import { unionBounds, type Bounds } from './geometry';
import type { Vec } from './math';

/** A link label: its text and whether the page exists. */
export interface LinkLabel {
  text: string;
  missing: boolean;
}

/** Label measurements in screen pixels (it doesn't grow or shrink with the zoom). */
const HEIGHT = 22;
const PADDING = 8;
const FONT_SIZE = 12.5;
const FONT = `600 ${FONT_SIZE}px "Nunito Sans Variable", system-ui, sans-serif`;
/** Offset above the top right corner (it leaves that corner's handle free). */
const LIFT = 10;
const OUTSET = 4;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = FONT;
  return measureCtx.measureText(text).width;
}

const labelText = (label: LinkLabel) => `→ ${label.text}`;

/** A link label on the canvas: it may represent several elements. */
export interface LinkBadge {
  link: string;
  ids: string[];
  label: LinkLabel;
  rect: Bounds;
}

const overlaps = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * Link labels. Whatever leads to the same page and is grouped or overlapping (a photo on
 * a sticky note) shares a single label, at the top right corner of the set.
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

/** Where the label goes (world): above the top right corner of `box`. */
function badgeRect(box: Bounds, label: LinkLabel, zoom: number): Bounds {
  const width = (textWidth(labelText(label)) + PADDING * 2) / zoom;
  const height = HEIGHT / zoom;
  const maxX = box.maxX + OUTSET / zoom;
  const minY = box.minY - height - LIFT / zoom;
  return { minX: maxX - width, minY, maxX, maxY: minY + height };
}

/** Paints the label "→ destination" (the context has the world transform). */
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

/** Label under the point (the last one drawn, which is on top), or null. */
export function badgeAt(badges: LinkBadge[], p: Vec): LinkBadge | null {
  for (let i = badges.length - 1; i >= 0; i--) {
    const r = badges[i].rect;
    if (p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY) return badges[i];
  }
  return null;
}
