import type { Camera } from './camera';

/** Base grid spacing in world units. */
const BASE_SPACING = 24;
/** Minimum on-screen spacing (px) of the main level; below it, dots are grouped. */
const MIN_SCREEN_SPACING = 20;
const DOT_SIZE = 1.6;

/**
 * Draws an infinite dot grid. There is always a "main" level with an on-screen spacing
 * between MIN and 2·MIN px, and an intermediate level that fades in when zooming in, so
 * the zoom feels continuous and infinite. It is drawn in screen coordinates (CSS px).
 */
export function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
  dpr: number,
  color: string,
) {
  let spacing = BASE_SPACING;
  while (spacing * cam.zoom < MIN_SCREEN_SPACING) spacing *= 2;
  while (spacing * cam.zoom >= MIN_SCREEN_SPACING * 2) spacing /= 2;

  // 0 right after changing level, 1 right before the next one.
  const t = (spacing * cam.zoom - MIN_SCREEN_SPACING) / MIN_SCREEN_SPACING;

  ctx.fillStyle = color;
  ctx.globalAlpha = 1;
  drawLevel(ctx, cam, width, height, dpr, spacing, false);

  const fineAlpha = t * t;
  if (fineAlpha > 0.03) {
    ctx.globalAlpha = fineAlpha;
    drawLevel(ctx, cam, width, height, dpr, spacing / 2, true);
    ctx.globalAlpha = 1;
  }
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
  dpr: number,
  spacing: number,
  skipCoarse: boolean,
) {
  const step = spacing * cam.zoom;
  const i0 = Math.floor(cam.x / spacing);
  const j0 = Math.floor(cam.y / spacing);
  const offsetX = (i0 * spacing - cam.x) * cam.zoom;
  const offsetY = (j0 * spacing - cam.y) * cam.zoom;
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const half = DOT_SIZE / 2;

  ctx.beginPath();
  for (let r = 0; r <= rows; r++) {
    const j = j0 + r;
    // Aligned to physical pixels so the dots look sharp.
    const y = Math.round((offsetY + r * step) * dpr) / dpr;
    for (let c = 0; c <= cols; c++) {
      const i = i0 + c;
      // The fine level's dots that match the main one are already painted.
      if (skipCoarse && i % 2 === 0 && j % 2 === 0) continue;
      const x = Math.round((offsetX + c * step) * dpr) / dpr;
      ctx.rect(x - half, y - half, DOT_SIZE, DOT_SIZE);
    }
  }
  ctx.fill();
}
