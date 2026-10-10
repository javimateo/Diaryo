import { cellular, fade, fbm, noise, sampleSurface, type Surface } from './noise';

export type CoverMaterial =
  'leather' | 'suede' | 'cloth' | 'canvas' | 'denim' | 'kraft' | 'marbled' | 'plain';

/** Cover materials, in the order they are offered. */
export const MATERIALS: CoverMaterial[] = [
  'leather',
  'suede',
  'cloth',
  'canvas',
  'denim',
  'kraft',
  'marbled',
  'plain',
];

/**
 * Materials with a color of their own (the one chosen for the covers isn't used). The
 * marbled paper is painted as it is; the others are a grain over the cover color.
 */
export const OWN_COLORS: Partial<Record<CoverMaterial, string>> = {
  kraft: '#b58c5e',
  marbled: '#efe6d4',
};

/** Side of the tile of a cover's grain, in world units (it repeats across the cover). */
export const COVER_TILE = 512;
/** The marbled paper's tile is as big as the cover: its swirls would be seen repeating. */
const MARBLED_TILE = 1024;

/** Side of the tile of each material, in world units. */
export const coverTile = (material: CoverMaterial) =>
  material === 'marbled' ? MARBLED_TILE : COVER_TILE;

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

/** Suede: a soft nap, brushed one way and another in patches, with almost no relief. */
const suede: Surface = {
  height: (x, y, pixel) => fbm(x / T, y / T, 96, 96, 3, 81) * fade(T / 96, pixel),
  tone(x, y, pixel) {
    const u = x / T;
    const v = y / T;
    const brushed = fbm(u, v, 3, 3, 3, 83);
    const nap = fbm(u, v, 192, 192, 1, 85) * fade(T / 192, pixel);
    return 0.5 + (brushed - 0.5) * 0.34 + (nap - 0.5) * 0.12;
  },
  relief: 0.25,
};

/** Threads per tile in the canvas: thick and uneven. */
const CANVAS_THREADS = 192;

/** Canvas: a coarse weave of thick threads, each one thicker and thinner along it. */
const canvas: Surface = {
  height(x, y, pixel) {
    const u = x / T;
    const v = y / T;
    const fx = u * CANVAS_THREADS;
    const fy = v * CANVAS_THREADS;
    const over = (Math.floor(fx) + Math.floor(fy)) % 2 === 0;
    const slubX = fbm(u, v, CANVAS_THREADS, 8, 2, 91);
    const slubY = fbm(u, v, 8, CANVAS_THREADS, 2, 93);
    const across = Math.sin(Math.PI * (fy - Math.floor(fy))) * (0.6 + slubX * 0.8);
    const down = Math.sin(Math.PI * (fx - Math.floor(fx))) * (0.6 + slubY * 0.8);
    const threads = Math.max(across * (over ? 1 : 0.75), down * (over ? 0.75 : 1));
    return threads * fade(T / CANVAS_THREADS, pixel);
  },
  tone(x, y) {
    const u = x / T;
    const v = y / T;
    const slubs = fbm(u, v, CANVAS_THREADS, 8, 2, 91) + fbm(u, v, 8, CANVAS_THREADS, 2, 93);
    return 0.5 + (slubs - 1) * 0.18 + (fbm(u, v, 4, 4, 2, 95) - 0.5) * 0.14;
  },
  relief: 0.55,
};

/** Diagonal ribs per tile in the denim. */
const TWILL = 128;

/** Denim: diagonal ribs (twill), with the lighter threads showing in streaks. */
const denim: Surface = {
  height(x, y, pixel) {
    const rib = ((x + y) / T) * TWILL;
    return Math.sin(Math.PI * (rib - Math.floor(rib))) * fade(T / TWILL, pixel);
  },
  tone(x, y, pixel) {
    const u = x / T;
    const v = y / T;
    // Light flecks of the white threads, and the worn look of the dye.
    const flecks = fbm(u, v, 192, 96, 1, 105) * fade(T / 96, pixel);
    const streaks = fbm(u, v, 48, 4, 2, 101);
    const worn = fbm(u, v, 4, 4, 3, 103);
    return 0.5 + (flecks - 0.5) * 0.2 + (streaks - 0.5) * 0.1 + (worn - 0.5) * 0.24;
  },
  relief: 0.35,
};

/** The inks of the marbled paper, over its cream. */
const MARBLE_INKS: [number, number, number][] = [
  [239, 230, 212],
  [201, 103, 126],
  [239, 230, 212],
  [70, 105, 156],
  [239, 230, 212],
  [201, 154, 46],
];

/**
 * Marbled paper: bands of ink dragged into swirls. The coordinates are bent by noise
 * (which repeats, so the tile still does); the bands follow what is left.
 */
function marbled(x: number, y: number): [number, number, number] {
  const u = x / MARBLED_TILE;
  const v = y / MARBLED_TILE;
  // Bent twice, for swirls inside swirls.
  const bu = u + (fbm(u, v, 2, 2, 4, 61) - 0.5) * 0.8;
  const bv = v + (fbm(u, v, 2, 2, 4, 67) - 0.5) * 0.8;
  // Many thin bands, one ink after another (a whole number of rounds of inks per tile,
  // so it has no seam).
  const bands =
    v * MARBLE_INKS.length * 4 +
    (fbm(bu, bv, 3, 3, 4, 71) - 0.5) * 12 +
    (fbm(bu, bv, 8, 8, 3, 73) - 0.5) * 5;
  const i = ((Math.floor(bands) % MARBLE_INKS.length) + MARBLE_INKS.length) % MARBLE_INKS.length;
  const f = bands - Math.floor(bands);
  const a = MARBLE_INKS[i];
  const b = MARBLE_INKS[(i + 1) % MARBLE_INKS.length];
  // Mostly one ink, and a quick change into the next one with a fine dark line.
  const mix = smooth(Math.min(1, Math.max(0, (f - 0.7) / 0.3)));
  const vein = 1 - 0.3 * (1 - smooth(Math.min(1, Math.abs(f - 0.85) / 0.04)));
  return [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * mix) * vein) as [number, number, number];
}

const SURFACES = { leather, suede, cloth, canvas, denim, kraft };

/**
 * A cover's grain at `size` pixels per side, in grey (128 = no change: it blends with the
 * cover color); the marbled paper, in its colors. The same tile at any size, with more
 * detail the bigger it is.
 */
export function coverPixels(
  material: Exclude<CoverMaterial, 'plain'>,
  size: number,
  samples: 1 | 2 = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const channels =
    material === 'marbled'
      ? [0, 1, 2].map((c) =>
          sampleSurface(
            { height: () => 0, tone: (x, y) => marbled(x, y)[c] / 255, relief: 0 },
            MARBLED_TILE,
            size,
            samples,
          ),
        )
      : Array(3).fill(sampleSurface(SURFACES[material], COVER_TILE, size, samples));
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = channels[0][i] * 255;
    data[i * 4 + 1] = channels[1][i] * 255;
    data[i * 4 + 2] = channels[2][i] * 255;
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
