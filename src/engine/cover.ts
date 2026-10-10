import { cellular, fade, fbm, noise, sampleSurface, type Surface } from './noise';

export type CoverMaterial = 'leather' | 'cloth' | 'kraft' | 'plain';

/** Cover materials, in the order they are offered. */
export const MATERIALS: CoverMaterial[] = ['leather', 'cloth', 'kraft', 'plain'];

/** Cardboard has its own color (the one chosen for the covers isn't used). */
export const KRAFT_COLOR = '#b58c5e';

/** Side of the tile of a cover's grain, in world units (it repeats across the cover). */
export const COVER_TILE = 512;

const smooth = (t: number) => t * t * (3 - 2 * t);
const T = COVER_TILE;

/** Leather: small rounded pebbles with fine creases between them, and soft wrinkles. */
const leather: Surface = {
  height(x, y, pixel) {
    // The coordinates wobble a little, so the pebbles are rounded and not polygons.
    const u = x / T;
    const v = y / T;
    const wx = x + (fbm(u, v, 64, 64, 2, 51) - 0.5) * 5;
    const wy = y + (fbm(u, v, 64, 64, 2, 53) - 0.5) * 5;
    const { nearest, second } = cellular(wx, wy, T, 120, 11);
    const pebble = Math.sqrt(smooth(Math.min(1, (second - nearest) / 0.5)));
    const wrinkles = fbm(u, v, 12, 40, 3, 31);
    const pebbles = pebble * (1 - 0.35 * nearest * nearest) * fade(T / 120, pixel);
    return pebbles * 0.55 + wrinkles * 0.45;
  },
  tone: (x, y) => 0.5 + (fbm(x / T, y / T, 4, 4, 3, 7) - 0.5) * 0.26,
  relief: 0.75,
};

/** Threads per tile in the cloth (it must be even: one goes over, the next one under). */
const THREADS = 320;

/** Cloth: threads crossing over and under, some thicker than others. */
const cloth: Surface = {
  height(x, y, pixel) {
    const fx = (x / T) * THREADS;
    const fy = (y / T) * THREADS;
    const over = (Math.floor(fx) + Math.floor(fy)) % 2 === 0;
    // Each thread is round: highest in its middle.
    const across = Math.sin(Math.PI * (fy - Math.floor(fy)));
    const down = Math.sin(Math.PI * (fx - Math.floor(fx)));
    const slub = fbm(x / T, y / T, 8, 64, 2, 21);
    const threads = Math.max(across * (over ? 1 : 0.7), down * (over ? 0.7 : 1));
    return threads * fade(T / THREADS, pixel) * 0.8 + slub * 0.2;
  },
  tone(x, y) {
    const u = x / T;
    const v = y / T;
    return 0.5 + (fbm(u, v, 8, 64, 2, 21) - 0.5) * 0.1 + (fbm(u, v, 4, 4, 2, 9) - 0.5) * 0.14;
  },
  relief: 0.35,
};

/**
 * Short, scattered fibres lying diagonally both ways (along the diagonals, so the tile
 * still repeats seamlessly): only the peaks of a long, thin noise, so there are few.
 */
function fibers(u: number, v: number, pixel: number): number {
  if (fade(2, pixel) === 0) return 0;
  const peak = (n: number) => smooth(Math.min(1, Math.max(0, (n - 0.66) / 0.2)));
  const both =
    peak(noise(32 * (u + v), 512 * (u - v), 32, 512, 37)) +
    peak(noise(32 * (u - v), 512 * (u + v), 32, 512, 41));
  return both * fade(2, pixel);
}

/** Cardboard: a pressed, almost flat surface, slightly mottled, with fibres and specks. */
const kraft: Surface = {
  height: (x, y, pixel) =>
    fbm(x / T, y / T, 32, 32, 3, 33) * 0.6 + fibers(x / T, y / T, pixel) * 0.3,
  tone(x, y, pixel) {
    const u = x / T;
    const v = y / T;
    const mottle = fbm(u, v, 6, 6, 3, 31);
    const grain = fbm(u, v, 128, 128, 2, 35);
    const { nearest, id } = cellular(x, y, T, 96, 43);
    const speck = id > 0.9 ? -0.3 * (1 - smooth(Math.min(1, nearest / 0.18))) : 0;
    const fine = (grain - 0.5) * 0.1 + fibers(u, v, pixel) * 0.08;
    return 0.5 + (mottle - 0.5) * 0.18 + fine + speck * fade(2, pixel);
  },
  relief: 0.3,
};

const SURFACES = { leather, cloth, kraft };

/**
 * A cover's grain at `size` pixels per side, in grey (128 = no change: it blends with the
 * cover color). The same tile at any size, with more detail the bigger it is.
 */
export function coverPixels(
  material: Exclude<CoverMaterial, 'plain'>,
  size: number,
  samples: 1 | 2 = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const values = sampleSurface(SURFACES[material], COVER_TILE, size, samples);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i] * 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Lightens (> 0) or darkens (< 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `rgb(${channel(n >> 16)}, ${channel((n >> 8) & 255)}, ${channel(n & 255)})`;
}
