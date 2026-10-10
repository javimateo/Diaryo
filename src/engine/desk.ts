import { cellular, fade, fbm, hash, sampleSurface, type Surface } from './noise';
import type { ThemeMode } from './palette';

export type DeskStyle =
  'plain' | 'wood' | 'cork' | 'linen' | 'walnut' | 'marble' | 'felt' | 'concrete';

/** Desks, in the order they are offered. */
export const DESKS: DeskStyle[] = [
  'plain',
  'wood',
  'cork',
  'linen',
  'walnut',
  'marble',
  'felt',
  'concrete',
];

/**
 * Side of a desk's tile, in its own units. The desks' surfaces are measured in them, and
 * their tone is how light they are: 1 is the base color and 0 the grain color.
 */
export const DESK_TILE = 512;

/** World units per unit of each desk's tile (wide planks, small granules…). */
export const DESK_SCALE: Record<DeskStyle, number> = {
  plain: 1,
  wood: 2.5,
  cork: 1.25,
  linen: 1,
  walnut: 2.5,
  marble: 2,
  felt: 1,
  concrete: 1.5,
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
  walnut: {
    light: [
      [124, 86, 60],
      [66, 42, 28],
    ],
    dark: [
      [38, 28, 21],
      [22, 16, 12],
    ],
  },
  marble: {
    light: [
      [241, 239, 235],
      [146, 146, 154],
    ],
    dark: [
      [40, 40, 42],
      [74, 74, 80],
    ],
  },
  felt: {
    light: [
      [86, 118, 102],
      [52, 78, 66],
    ],
    dark: [
      [30, 41, 36],
      [19, 27, 23],
    ],
  },
  concrete: {
    light: [
      [176, 173, 167],
      [118, 115, 110],
    ],
    dark: [
      [46, 45, 43],
      [28, 28, 27],
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
const smooth = (t: number) => t * t * (3 - 2 * t);
/** 1 on a line and 0 from `width` away, softly. */
const line = (distance: number, width: number) => 1 - smooth(Math.min(1, distance / width));

/** Distance to the nearest joint between planks or the end of a plank. */
function joint(x: number, y: number): number {
  const plank = Math.floor(y / PLANK);
  const inPlank = y - plank * PLANK;
  // Each plank ends at a different place.
  const end = hash(plank, 1, 7) * DESK_TILE;
  const along = Math.abs(x - end);
  return Math.min(inPlank, PLANK - inPlank, along, DESK_TILE - along);
}

/**
 * Planks of wood, horizontal, with their grain and slightly sunken joints between them.
 * `rings` is how far apart the grain lines are, `wave` how much they wave and `figure`
 * how thin they are (higher, thinner).
 */
function planks(rings: number, wave: number, figure: number): Surface {
  /** The dark rings of the wood, waving along each plank (0 to 1). */
  const streak = (x: number, y: number) => {
    const plank = Math.floor(y / PLANK);
    const warp = fbm(x / DESK_TILE, y / DESK_TILE, 3, 16, 3, 11 + plank);
    const ring = Math.sin(((y + warp * wave + plank * 17) * Math.PI * 2) / rings);
    return Math.pow(0.5 - 0.5 * ring, figure);
  };
  return {
    height(x, y, pixel) {
      const fine = fbm(x / DESK_TILE, y / DESK_TILE, 16, 512, 2, 9) * fade(1, pixel);
      return -streak(x, y) * 0.3 - fine * 0.15 - line(joint(x, y), 1.5) * 0.8;
    },
    tone(x, y) {
      const u = x / DESK_TILE;
      const v = y / DESK_TILE;
      const plank = Math.floor(y / PLANK);
      const fine = fbm(u, v, 64, 256, 1, 5) * 0.6 + fbm(u, v, 16, 512, 2, 9) * 0.4;
      const tone = fbm(u, v, 2, 8, 2, 31 + plank) - 0.5 + (hash(plank, 0, 3) - 0.5) * 0.5;
      const grain = 0.28 + streak(x, y) * 0.45 + (fine - 0.5) * 0.16 + tone * 0.35;
      return 1 - grain - line(joint(x, y), 1.2) * 0.5;
    },
    relief: 0.6,
  };
}

/** Light wood: wide, calm grain. */
const wood = planks(11, 34, 4);

/** Walnut: dark wood with a closer, wavier grain. */
const walnut = planks(7, 60, 2);

/** Cork granules: the coordinates wobble so they are irregular, not polygons. */
function granule(x: number, y: number) {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const wx = x + (fbm(u, v, 64, 64, 1, 13) - 0.5) * 3;
  const wy = y + (fbm(u, v, 64, 64, 1, 15) - 0.5) * 3;
  return cellular(wx, wy, DESK_TILE, 128, 17);
}

/** Cork: pressed granules, each one of its own shade, with small dark holes. */
const cork: Surface = {
  height(x, y, pixel) {
    const { nearest, second } = granule(x, y);
    const bump =
      smooth(Math.min(1, (second - nearest) / 0.35)) * 0.5 + (1 - nearest * nearest) * 0.5;
    return bump * fade(DESK_TILE / 128, pixel);
  },
  tone(x, y, pixel) {
    const { nearest, second, id } = granule(x, y);
    const pore = cellular(x, y, DESK_TILE, 256, 41);
    const dark = pore.id > 0.85 ? line(pore.nearest, 0.45) * 0.7 * fade(1, pixel) : 0;
    const fine = fbm(x / DESK_TILE, y / DESK_TILE, 128, 128, 2, 23);
    const gap = line(second - nearest, 0.08) * 0.15 * fade(DESK_TILE / 128, pixel);
    return 0.45 + id * 0.4 + (fine - 0.5) * 0.35 - gap - dark;
  },
  relief: 0.2,
};

/** Threads per tile of the linen (even: one goes over, the next one under). */
const LINEN_THREADS = 128;

/** Linen: fine crossed threads, uneven: thicker and thinner along each one. */
function weave(x: number, y: number, pixel: number): number {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const fx = u * LINEN_THREADS;
  const fy = v * LINEN_THREADS;
  const over = (Math.floor(fx) + Math.floor(fy)) % 2 === 0;
  // Each thread's thickness changes along it (slubs), so the weave isn't a grid.
  const slubX = fbm(u, v, LINEN_THREADS, 8, 2, 51);
  const slubY = fbm(u, v, 8, LINEN_THREADS, 2, 57);
  const across = Math.sin(Math.PI * (fy - Math.floor(fy))) * (0.6 + slubX * 0.8);
  const down = Math.sin(Math.PI * (fx - Math.floor(fx))) * (0.6 + slubY * 0.8);
  const threads = Math.max(across * (over ? 1 : 0.7), down * (over ? 0.7 : 1));
  return threads * fade(DESK_TILE / LINEN_THREADS, pixel);
}

const linen: Surface = {
  height: weave,
  tone(x, y, pixel) {
    const u = x / DESK_TILE;
    const v = y / DESK_TILE;
    const slubs = fbm(u, v, LINEN_THREADS, 8, 2, 51) + fbm(u, v, 8, LINEN_THREADS, 2, 57);
    const tone = fbm(u, v, 4, 4, 2, 61);
    return 0.65 + weave(x, y, pixel) * 0.3 - (slubs - 1) * 0.35 - (tone - 0.5) * 0.25;
  },
  relief: 0.5,
};

/** Marble: white with grey veins, a large soft one and finer ones; polished, flat. */
const marble: Surface = {
  height: () => 0,
  tone(x, y, pixel) {
    const u = x / DESK_TILE;
    const v = y / DESK_TILE;
    const cloud = fbm(u, v, 4, 4, 4, 111);
    // Veins: where a wave across the tile, bent by noise, crosses zero.
    const vein = (k: number, j: number, bend: number, width: number, seed: number) =>
      line(Math.abs(Math.sin(Math.PI * (k * u + j * v + bend * fbm(u, v, 3, 3, 5, seed)))), width);
    const main = vein(1, 2, 2.5, 0.06, 113);
    const fine = vein(3, 2, 3, 0.03, 117) * fade(2, pixel);
    return 1 - main * 0.65 - fine * 0.3 - (cloud - 0.5) * 0.25;
  },
  relief: 0,
};

/** Felt: a soft mat of short fibres, slightly mottled. */
const felt: Surface = {
  height: (x, y, pixel) => fbm(x / DESK_TILE, y / DESK_TILE, 128, 128, 2, 121) * fade(4, pixel),
  tone(x, y, pixel) {
    const u = x / DESK_TILE;
    const v = y / DESK_TILE;
    const mottle = fbm(u, v, 4, 4, 3, 123);
    const fibers = fbm(u, v, 256, 256, 1, 125) * fade(2, pixel);
    return 0.65 + (mottle - 0.5) * 0.35 + (fibers - 0.5) * 0.35;
  },
  relief: 0.3,
};

/** Concrete: grey, cloudy, with grains of gravel and small air holes. */
const concrete: Surface = {
  height(x, y, pixel) {
    const hole = cellular(x, y, DESK_TILE, 160, 131);
    return hole.id > 0.88 ? -line(hole.nearest, 0.35) * fade(2, pixel) : 0;
  },
  tone(x, y, pixel) {
    const u = x / DESK_TILE;
    const v = y / DESK_TILE;
    const cloud = fbm(u, v, 6, 6, 4, 133);
    const gravel = cellular(x, y, DESK_TILE, 96, 137);
    const stone =
      gravel.id > 0.75 ? (gravel.id - 0.87) * 1.4 * line(gravel.nearest, 0.4) * fade(3, pixel) : 0;
    const hole = cellular(x, y, DESK_TILE, 160, 131);
    const dark = hole.id > 0.88 ? line(hole.nearest, 0.35) * 0.5 * fade(2, pixel) : 0;
    const fine = fbm(u, v, 128, 128, 2, 139) * fade(4, pixel);
    return 0.62 + (cloud - 0.5) * 0.55 + stone + (fine - 0.5) * 0.2 - dark;
  },
  relief: 0.35,
};

const SURFACES = { wood, cork, linen, walnut, marble, felt, concrete };

/**
 * Pixels (RGBA) of a desk texture at `size` pixels per side: the same tile at any size,
 * with more detail the bigger it is.
 */
export function deskPixels(
  style: Exclude<DeskStyle, 'plain'>,
  mode: ThemeMode,
  size: number,
  samples: 1 | 2 = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const [base, dark] = PALETTES[style][mode];
  const values = sampleSurface(SURFACES[style], DESK_TILE, size, samples);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < values.length; i++) {
    const t = values[i];
    data[i * 4] = dark[0] + (base[0] - dark[0]) * t;
    data[i * 4 + 1] = dark[1] + (base[1] - dark[1]) * t;
    data[i * 4 + 2] = dark[2] + (base[2] - dark[2]) * t;
    data[i * 4 + 3] = 255;
  }
  return data;
}
