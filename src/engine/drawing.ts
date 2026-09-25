import type { Camera } from './camera';
import { DESK_SCALE, deskColor, deskTexture, type DeskStyle } from './desk';
import type { Bounds } from './geometry';
import { clamp, easeOutCubic } from './math';
import type { ThemeMode } from './palette';

/**
 * What goes under everything: the desk with its texture, nothing (the desktop layer) or a
 * soft veil over the desktop (the floating diary).
 */
export type Backdrop = { kind: 'clear' } | { kind: 'veil' } | { kind: 'desk'; style: DeskStyle };

const patterns = new WeakMap<HTMLCanvasElement, CanvasPattern>();

/**
 * Paints the background in physical pixels. The desk texture is stuck to the world (it
 * moves with the book); from far away it fades into its color, so it doesn't flicker.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  backdrop: Backdrop,
  theme: { mode: ThemeMode; background: string },
  camera: Camera,
  dpr: number,
) {
  const { mode } = theme;
  if (backdrop.kind !== 'desk') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (backdrop.kind === 'clear') return;
    ctx.fillStyle = mode === 'dark' ? 'rgba(0, 0, 0, 0.38)' : 'rgba(24, 18, 12, 0.22)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const { style } = backdrop;
  ctx.fillStyle = deskColor(style, mode) ?? theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = deskTexture(style, mode);
  if (!texture) return;
  const k = dpr * camera.zoom * DESK_SCALE[style];
  const alpha = clamp((k - 0.2) / 0.25, 0, 1);
  if (alpha === 0) return;
  let pattern = patterns.get(texture);
  if (!pattern) {
    pattern = ctx.createPattern(texture, 'repeat') ?? undefined;
    if (!pattern) return;
    patterns.set(texture, pattern);
  }
  const scale = dpr * camera.zoom;
  pattern.setTransform(new DOMMatrix([k, 0, 0, k, -camera.x * scale, -camera.y * scale]));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
}

/**
 * Glow around something pointed at (in world coordinates): a wave that opens and a frame
 * that fades. `t` goes from 0 to 1 along the glow.
 */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  b: Bounds,
  t: number,
  zoom: number,
  color: string,
) {
  if (t < 0) return;
  const rect = (pad: number) => {
    ctx.beginPath();
    ctx.roundRect(
      b.minX - pad / zoom,
      b.minY - pad / zoom,
      b.maxX - b.minX + (pad * 2) / zoom,
      b.maxY - b.minY + (pad * 2) / zoom,
      (pad + 4) / zoom,
    );
  };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const wave = easeOutCubic(clamp(t / 0.55, 0, 1));
  ctx.globalAlpha = 0.55 * (1 - wave);
  ctx.lineWidth = 2 / zoom;
  rect(8 + 28 * wave);
  ctx.stroke();
  const alpha = clamp(t / 0.1, 0, 1) * clamp((1 - t) / 0.4, 0, 1);
  rect(8);
  ctx.globalAlpha = alpha * 0.12;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2.5 / zoom;
  ctx.stroke();
  ctx.restore();
}
