import type { ImageFrame } from './elements';

/**
 * Photo frames. The frame goes inside the photo's box: the paper (polaroid or white border)
 * takes a margin and the photo fills what is left, cropped (not stretched) to fit.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Margins relative to the box's shorter side: a polaroid's is wider at the bottom. */
const MARGINS: Record<ImageFrame, { side: number; bottom: number }> = {
  polaroid: { side: 0.06, bottom: 0.2 },
  border: { side: 0.045, bottom: 0.045 },
  rounded: { side: 0, bottom: 0 },
};

/** Corner radius of the rounded frame, relative to the shorter side. */
export const ROUNDED_RADIUS = 0.09;

/** Where the photo goes inside a box of that size with that frame. */
export function photoArea(width: number, height: number, frame?: ImageFrame): Rect {
  if (!frame) return { x: 0, y: 0, width, height };
  const short = Math.min(width, height);
  const { side, bottom } = MARGINS[frame];
  const m = side * short;
  return {
    x: m,
    y: m,
    width: Math.max(0, width - m * 2),
    height: Math.max(0, height - m - bottom * short),
  };
}

/**
 * The part of an image (w×h) that fills `area` without stretching: centered, cropping
 * what is left over on one axis (like CSS `object-fit: cover`).
 */
export function coverCrop(w: number, h: number, area: Rect): Rect {
  if (w <= 0 || h <= 0 || area.width <= 0 || area.height <= 0) {
    return { x: 0, y: 0, width: w, height: h };
  }
  const scale = Math.max(area.width / w, area.height / h);
  const width = area.width / scale;
  const height = area.height / scale;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/**
 * The box height that, with that frame and width, leaves the photo's place with the given
 * proportions (width / height): the frame adapts to the photo, not the other way round.
 */
export function heightForPhoto(width: number, aspect: number, frame?: ImageFrame): number {
  let height = width / aspect;
  // The margins depend on the shorter side, which depends on the height: a few rounds
  // settle it.
  for (let i = 0; i < 8; i++) {
    const area = photoArea(width, height, frame);
    height += area.width / aspect - area.height;
  }
  return height;
}
