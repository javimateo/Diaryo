import { COVER_TILE, coverPixels, type CoverMaterial } from './cover';
import { DESK_SCALE, DESK_TILE, deskPixels, type DeskStyle } from './desk';
import type { ThemeMode } from './palette';

/** A texture made from noise: the grain of a cover or a desk (at day or night). */
export type TextureRequest =
  | { kind: 'cover'; material: Exclude<CoverMaterial, 'plain'> }
  | { kind: 'desk'; style: Exclude<DeskStyle, 'plain'>; mode: ThemeMode };

/** World units the texture's tile measures (it repeats). */
export const tileSize = (request: TextureRequest): number =>
  request.kind === 'cover' ? COVER_TILE : DESK_TILE * DESK_SCALE[request.style];

/** The texture's pixels (RGBA) at `size` × `size`. */
export function texturePixels(
  request: TextureRequest,
  size: number,
  samples: 1 | 2,
): Uint8ClampedArray<ArrayBuffer> {
  return request.kind === 'cover'
    ? coverPixels(request.material, size, samples)
    : deskPixels(request.style, request.mode, size, samples);
}
