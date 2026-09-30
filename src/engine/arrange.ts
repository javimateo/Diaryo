import type { AssetStore } from './assets';
import { elementBounds, type SceneElement } from './elements';
import { unionBounds } from './geometry';
import type { ThemeMode } from './palette';
import { drawElement } from './render';
import type { Changes } from './scene';
import { scaleElement, selectionBox } from './transform';

export type ArrangeMode = 'front' | 'forward' | 'backward' | 'back';

/**
 * Changes the stacking order of the selection. `all` goes from bottom to top.
 * "Forward/backward" moves it one step; "to front/to back" takes it to the end. Only the
 * elements whose order changes are returned.
 */
export function arrange(all: SceneElement[], selected: Set<string>, mode: ArrangeMode): Changes {
  const changes: Changes = new Map();
  const picked = all.filter((el) => selected.has(el.id));
  if (picked.length === 0 || picked.length === all.length) return changes;

  if (mode === 'front' || mode === 'back') {
    const edge = mode === 'front' ? all[all.length - 1].z + 1 : all[0].z - picked.length;
    picked.forEach((el, i) => changes.set(el.id, { ...el, z: edge + i }));
    return changes;
  }

  // The z values are swapped with the unselected neighbour, like sliding a block.
  const z = all.map((el) => el.z);
  const order = [...all];
  const swap = (i: number, j: number) => {
    [order[i], order[j]] = [order[j], order[i]];
  };
  if (mode === 'forward') {
    for (let i = order.length - 2; i >= 0; i--) {
      if (selected.has(order[i].id) && !selected.has(order[i + 1].id)) swap(i, i + 1);
    }
  } else {
    for (let i = 1; i < order.length; i++) {
      if (selected.has(order[i].id) && !selected.has(order[i - 1].id)) swap(i, i - 1);
    }
  }
  order.forEach((el, i) => {
    if (el.z !== z[i]) changes.set(el.id, { ...el, z: z[i] });
  });
  return changes;
}

/** Is `inner` entirely within `outer`'s box? */
const within = (inner: SceneElement, outer: SceneElement) => {
  const a = elementBounds(inner);
  const b = elementBounds(outer);
  return a.minX >= b.minX && a.minY >= b.minY && a.maxX <= b.maxX && a.maxY <= b.maxY;
};

/**
 * A shape or closed stroke that has just got a fill goes behind what lies inside it:
 * drawn later, it was on top, and its new fill would cover what it holds. It only goes
 * down as far as needed, above whatever was already behind all of that. Returns the new
 * stacking order of those that move.
 */
export function fillBehind(all: SceneElement[], filled: SceneElement[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const container of filled) {
    const inside = all.filter(
      (el) => el.id !== container.id && el.z < container.z && within(el, container),
    );
    if (inside.length === 0) continue;
    const lowest = Math.min(...inside.map((el) => el.z));
    const below = all
      .filter((el) => el.id !== container.id && el.z < lowest)
      .reduce((max, el) => Math.max(max, el.z), -Infinity);
    result.set(container.id, below === -Infinity ? lowest - 1 : (below + lowest) / 2);
  }
  return result;
}

/**
 * Mirrors around the center of the selection. Strokes are really mirrored; texts, notes
 * and images change places but don't read backwards.
 */
export function flip(elements: SceneElement[], axis: 'horizontal' | 'vertical'): Changes {
  const box = selectionBox(elements);
  const changes: Changes = new Map();
  if (!box) return changes;
  const sx = axis === 'horizontal' ? -1 : 1;
  const sy = axis === 'vertical' ? -1 : 1;
  for (const el of elements) changes.set(el.id, scaleElement(el, box, { x: 0, y: 0 }, sx, sy));
  return changes;
}

/** Largest side allowed for the exported image (browsers don't support more). */
const MAX_SIDE = 8192;

/** Paints the elements into a PNG image, at double resolution and with a small margin. */
export function elementsToPng(
  elements: SceneElement[],
  options: { mode: ThemeMode; assets: AssetStore; background: string; scale?: number },
): Promise<Blob | null> {
  const bounds = elements.map(elementBounds).reduce(unionBounds);
  const padding = 16;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(options.scale ?? 2, MAX_SIDE / width, MAX_SIDE / height);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    (padding - bounds.minX) * scale,
    (padding - bounds.minY) * scale,
  );
  const rc = { mode: options.mode, pixelScale: scale, assets: options.assets, editingId: null };
  for (const el of [...elements].sort((a, b) => a.z - b.z)) drawElement(ctx, el, rc);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Draws the elements fitted (centered) into a canvas of that size, without a background. */
export function renderElements(
  elements: SceneElement[],
  options: { mode: ThemeMode; assets: AssetStore; width: number; height: number },
): HTMLCanvasElement {
  const { width, height } = options;
  const bounds = elements.map(elementBounds).reduce(unionBounds);
  const padding = Math.min(width, height) * 0.08;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  // It doesn't enlarge beyond 100%: a lone note doesn't fill the whole thumbnail.
  const scale = Math.min((width - padding * 2) / contentW, (height - padding * 2) / contentH, 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    width / 2 - (bounds.minX + contentW / 2) * scale,
    height / 2 - (bounds.minY + contentH / 2) * scale,
  );
  const rc = { mode: options.mode, pixelScale: scale, assets: options.assets, editingId: null };
  for (const el of [...elements].sort((a, b) => a.z - b.z)) drawElement(ctx, el, rc);
  return canvas;
}
