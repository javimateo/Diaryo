import { fbm, hash, noise } from './noise';
import type { ThemeMode } from './palette';

export type DeskStyle = 'plain' | 'wood' | 'cork' | 'linen';

/** Desks, in the order they are offered. */
export const DESKS: DeskStyle[] = ['plain', 'wood', 'cork', 'linen'];

/** Side of the texture, in pixels. */
export const DESK_TILE = 512;

/** World units per pixel of each texture (wide planks, small granules…). */
export const DESK_SCALE: Record<DeskStyle, number> = {
  plain: 1,
  wood: 2.5,
  cork: 1.25,
  linen: 1,
};

type RGB = [number, number, number];

/** Colors of each desk: base and grain, for day and night. */
const PALETTES: Record<Exclude<DeskStyle, 'plain'>, Record<ThemeMode, [RGB, RGB]>> = {
  wood: {
    light: [
      [202, 168, 126],
      [156, 116, 78],
    ],
    dark: [
      [46, 37, 29],
      [31, 24, 18],
    ],
  },
  cork: {
    light: [
      [212, 170, 122],
      [150, 104, 64],
    ],
    dark: [
      [52, 41, 31],
      [30, 23, 17],
    ],
  },
  linen: {
    light: [
      [232, 227, 217],
      [206, 199, 185],
    ],
    dark: [
      [27, 26, 23],
      [18, 17, 15],
    ],
  },
};

/** Background color while the texture isn't visible (and for what is very far away). */
export function deskColor(style: DeskStyle, mode: ThemeMode): string | null {
  if (style === 'plain') return null;
  const [base, grain] = PALETTES[style][mode];
  const mix = base.map((v, i) => Math.round(v * 0.8 + grain[i] * 0.2));
  return `rgb(${mix.join(', ')})`;
}

const PLANK = DESK_TILE / 4;

/**
 * Wood: horizontal planks with their grain and joints. Returns how much grain there is (0
 * to 1).
 */
function wood(x: number, y: number): number {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const plank = Math.floor(y / PLANK);
  const warp = fbm(u, v, 3, 16, 3, 11 + plank);
  const rings = Math.sin(((y + warp * 34 + plank * 17) * Math.PI * 2) / 11);
  const streak = Math.pow(1 - (0.5 + 0.5 * rings), 4);
  const fine = fbm(u, v, 64, 256, 1, 5);
  const tone = fbm(u, v, 2, 8, 2, 31 + plank) - 0.5 + (hash(plank, 0, 3) - 0.5) * 0.5;
  let grain = 0.28 + streak * 0.45 + (fine - 0.5) * 0.16 + tone * 0.35;
  // Joints between planks and the end of each one (at a different place on each plank).
  const inPlank = y - plank * PLANK;
  if (inPlank < 1.5 || inPlank > PLANK - 1) grain = 0.95;
  const end = Math.floor(hash(plank, 1, 7) * DESK_TILE);
  if (Math.abs(x - end) < 1.2) grain = 0.9;
  return grain;
}

/** Cork: granules of different sizes and some dark specks. */
function cork(x: number, y: number): number {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const big = fbm(u, v, 64, 64, 2, 17);
  const small = noise(u * 160, v * 160, 160, 160, 23);
  let grain = 0.75 - (big * 0.6 + small * 0.4) * 0.9;
  if (hash(x, y, 41) > 0.992) grain += 0.35;
  return grain;
}

/** Linen: very fine crossed threads, with irregularities along each thread. */
function linen(x: number, y: number): number {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const across = 0.5 + 0.5 * Math.sin((x * Math.PI * 2) / 8);
  const down = 0.5 + 0.5 * Math.sin((y * Math.PI * 2) / 8);
  const slubX = fbm(u, v, 8, 128, 2, 51);
  const slubY = fbm(u, v, 128, 8, 2, 57);
  const weave = (across * (0.4 + slubY) + down * (0.4 + slubX)) / 2;
  const tone = fbm(u, v, 4, 4, 2, 61);
  return 0.18 + weave * 0.35 + (tone - 0.5) * 0.25;
}

const GRAIN = { wood, cork, linen };

/** Pixels (RGBA) of a desk texture. */
export function deskPixels(
  style: Exclude<DeskStyle, 'plain'>,
  mode: ThemeMode,
): Uint8ClampedArray<ArrayBuffer> {
  const [base, dark] = PALETTES[style][mode];
  const grainAt = GRAIN[style];
  const data = new Uint8ClampedArray(DESK_TILE * DESK_TILE * 4);
  for (let y = 0; y < DESK_TILE; y++) {
    for (let x = 0; x < DESK_TILE; x++) {
      const t = Math.min(1, Math.max(0, grainAt(x, y)));
      const i = (y * DESK_TILE + x) * 4;
      data[i] = base[0] + (dark[0] - base[0]) * t;
      data[i + 1] = base[1] + (dark[1] - base[1]) * t;
      data[i + 2] = base[2] + (dark[2] - base[2]) * t;
      data[i + 3] = 255;
    }
  }
  return data;
}

const textures = new Map<string, HTMLCanvasElement>();

/** The desk texture (made once per desk and theme), or null if plain. */
export function deskTexture(style: DeskStyle, mode: ThemeMode): HTMLCanvasElement | null {
  if (style === 'plain') return null;
  const key = `${style}/${mode}`;
  let canvas = textures.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = DESK_TILE;
    canvas.height = DESK_TILE;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(deskPixels(style, mode), DESK_TILE, DESK_TILE), 0, 0);
    textures.set(key, canvas);
  }
  return canvas;
}

const urls = new Map<string, string>();

/** The texture as an image (for the map background and the swatches). */
export function deskImage(style: DeskStyle, mode: ThemeMode): string | null {
  const texture = deskTexture(style, mode);
  if (!texture) return null;
  const key = `${style}/${mode}`;
  let url = urls.get(key);
  if (!url) {
    url = texture.toDataURL('image/webp', 0.9);
    urls.set(key, url);
  }
  return url;
}
