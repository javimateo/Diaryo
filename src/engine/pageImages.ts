/**
 * Images of pages drawn off screen: thumbnails, the closed diary's cover, the double page
 * of the turning sheet and the page exported as a PNG. What is saved (thumbnails, covers) never shows a private
 * note's text, even while it can be seen.
 */
import { MAX_SIDE, renderElements } from './arrange';
import type { AssetStore } from './assets';
import {
  bookBounds,
  drawBinding,
  drawBook,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  traceClosedCover,
  type BookSpread,
} from './book';
import { drawBackdrop } from './drawing';
import { concealNote, elementBounds, type SceneElement } from './elements';
import { unionBounds } from './geometry';
import type { TurnTarget } from './pageTurn';
import type { ThemeMode } from './palette';
import { drawElement, type RenderContext } from './render';

/** Private notes as they are when hidden (no text). */
export const concealPrivate = (elements: SceneElement[]) =>
  elements.map((el) => (el.type === 'note' && el.private ? concealNote(el) : el));

/** Draws a double page (paper and content, without covers) for the turning sheet. */
export function renderSpread(
  target: TurnTarget,
  scale: number,
  mode: ThemeMode,
  assets: AssetStore,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_WIDTH * 2 * scale);
  canvas.height = Math.round(PAGE_HEIGHT * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, PAGE_WIDTH * scale, (PAGE_HEIGHT / 2) * scale);
  drawBook(ctx, target.book, mode, scale, true);
  const rc: RenderContext = { mode, pixelScale: scale, assets, editingId: null };
  for (const el of [...target.elements].sort((a, b) => a.z - b.z)) drawElement(ctx, el, rc);
  return canvas;
}

/** Thumbnail of a double page, at that width. */
export function spreadThumbnail(
  target: TurnTarget,
  width: number,
  mode: ThemeMode,
  assets: AssetStore,
): string {
  const concealed = { ...target, elements: concealPrivate(target.elements) };
  return renderSpread(concealed, width / (PAGE_WIDTH * 2), mode, assets).toDataURL(
    'image/webp',
    0.85,
  );
}

/**
 * The closed diary's cover as an image, at that width: the board, what is stuck on it
 * (ending at its edge) and the elastic on top.
 */
export function coverImage(
  book: BookSpread,
  elements: SceneElement[],
  width: number,
  assets: AssetStore,
): string {
  const closed = { ...book, closed: true };
  const bounds = bookBounds(closed);
  const scale = width / (bounds.maxX - bounds.minX);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round((bounds.maxY - bounds.minY) * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);
  drawBook(ctx, closed, 'light', scale);
  ctx.save();
  traceClosedCover(ctx);
  ctx.clip();
  const rc: RenderContext = { mode: 'light', pixelScale: scale, assets, editingId: null };
  for (const el of concealPrivate([...elements].sort((a, b) => a.z - b.z)))
    drawElement(ctx, el, rc);
  ctx.restore();
  drawBinding(ctx, closed, scale);
  return canvas.toDataURL('image/webp', 0.85);
}

/**
 * Thumbnail of a page (loose, or the diary's open or closed), or null if there is
 * nothing to show.
 */
export function pageThumbnail(
  elements: SceneElement[],
  book: BookSpread | null,
  size: { width: number; height: number },
  mode: ThemeMode,
  assets: AssetStore,
): string | null {
  const { width, height } = size;
  // The closed diary: its cover, also when nothing is stuck on it yet.
  if (book?.closed) return coverImage(book, elements, width, assets);
  if (elements.length === 0) return null;
  // In the diary, the double page in small (paper, date and content in place).
  if (book) return spreadThumbnail({ id: '', elements, book }, width, mode, assets);
  const canvas = renderElements(concealPrivate(elements), {
    mode: 'light',
    assets,
    width,
    height,
  });
  return canvas.toDataURL('image/webp', 0.8);
}

/**
 * The page in a PNG as the screen shows it: the desk with its texture, the book (open or
 * closed) and everything on it and around it, at twice the size (smaller if it would be
 * too large).
 */
export function pageToPng(
  elements: SceneElement[],
  book: BookSpread,
  deskIds: ReadonlySet<string>,
  options: { mode: ThemeMode; background: string; assets: AssetStore },
): Promise<Blob | null> {
  const padding = 32;
  const bounds = elements.map(elementBounds).reduce(unionBounds, bookBounds(book));
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(2, MAX_SIDE / width, MAX_SIDE / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  const { mode, assets } = options;
  drawBackdrop(
    ctx,
    canvas,
    { kind: 'desk', style: book.style.desk },
    options,
    {
      x: minX,
      y: minY,
      zoom: scale,
    },
    1,
  );
  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  drawBook(ctx, book, mode, scale);
  const rc: RenderContext = { mode, pixelScale: scale, assets, editingId: null };
  const sorted = [...elements].sort((a, b) => a.z - b.z);
  // As on the screen: on the closed diary, what is stuck on the cover ends at its edge.
  const closed = !!book.closed;
  const loose = (el: SceneElement) => closed && deskIds.has(el.id);
  for (const el of sorted) if (loose(el)) drawElement(ctx, el, rc);
  if (closed) {
    ctx.save();
    traceClosedCover(ctx);
    ctx.clip();
  }
  for (const el of sorted) if (!loose(el)) drawElement(ctx, el, rc);
  if (closed) ctx.restore();
  drawBinding(ctx, book, scale);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
