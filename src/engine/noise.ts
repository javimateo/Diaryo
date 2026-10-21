/**
 * Noise for procedurally made textures (desk, covers). It repeats every certain number of
 * cells, so the textures have no seams when tiled.
 */

export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (i: number, period: number) =>
  i >= 0 && i < period ? i : ((i % period) + period) % period;

const lattices = new Map<number, Float32Array>();

/**
 * The random values at the corners of a grid of `px` × `py` cells. They are always the
 * same, so they are worked out once: hashing them at every point made big textures slow.
 */
function lattice(px: number, py: number, seed: number): Float32Array {
  const key = (seed * 4096 + px) * 4096 + py;
  let values = lattices.get(key);
  if (!values) {
    values = new Float32Array(px * py);
    for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) values[y * px + x] = hash(x, y, seed);
    lattices.set(key, values);
  }
  return values;
}

/** Smooth noise on a grid that repeats every `px` × `py` cells (0 to 1). */
export function noise(x: number, y: number, px: number, py: number, seed: number): number {
  const values = lattice(px, py, seed);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ax = wrap(x0, px);
  const bx = ax + 1 === px ? 0 : ax + 1;
  const ay = wrap(y0, py) * px;
  const by = ay + px === px * py ? 0 : ay + px;
  const a = values[ay + ax];
  const b = values[ay + bx];
  const c = values[by + ax];
  const d = values[by + bx];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Several layers of noise, each one twice as fine (0 to 1). `u` and `v` go from 0 to 1
 * across the texture; `cx` × `cy` are the cells of the first layer.
 */
export function fbm(u: number, v: number, cx: number, cy: number, octaves: number, seed: number) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const k = 2 ** o;
    sum += amplitude * noise(u * cx * k, v * cy * k, cx * k, cy * k, seed + o);
    total += amplitude;
    amplitude *= 0.5;
  }
  return sum / total;
}

/**
 * Cellular noise: distances to the nearest and to the second nearest of some scattered
 * points, one per cell (`cells` × `cells` across a tile of side `tile`, so it repeats too).
 * Where both distances are equal there is a border between two cells: pebbles of leather,
 * cork granules. Distances are in cells; `id` is a value of the nearest cell's own (0 to 1).
 */
export function cellular(x: number, y: number, tile: number, cells: number, seed: number) {
  const cx = (x / tile) * cells;
  const cy = (y / tile) * cells;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const offsetX = lattice(cells, cells, seed);
  const offsetY = lattice(cells, cells, seed + 1);
  const ids = lattice(cells, cells, seed + 2);
  let nearest = 9;
  let second = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    const row = wrap(iy + j, cells) * cells;
    for (let i = -1; i <= 1; i++) {
      const k = row + wrap(ix + i, cells);
      const dx = ix + i + 0.15 + 0.7 * offsetX[k] - cx;
      const dy = iy + j + 0.15 + 0.7 * offsetY[k] - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearest) {
        second = nearest;
        nearest = d;
        id = ids[k];
      } else if (d < second) second = d;
    }
  }
  return { nearest, second, id };
}

/**
 * A material seen up close, at each point of its tile: how high it is and its tone (0.5 =
 * no change). The light comes from the top left, so the slopes facing it light up and the
 * others darken; `relief` says how much. `pixel` is how much a pixel of the texture
 * measures, so details too small for it can fade out (see `fade`).
 */
export interface Surface {
  height: (x: number, y: number, pixel: number) => number;
  tone: (x: number, y: number, pixel: number) => number;
  relief: number;
}

/**
 * How much of a detail of this width to keep at this pixel size: all of it from four
 * pixels wide, nothing below two. Smaller, it would turn into a grid or noise (it's what
 * mipmaps do).
 */
export const fade = (width: number, pixel: number) =>
  smooth(Math.min(1, Math.max(0, width / pixel / 2 - 1)));

/**
 * The surface on a grid of `size` × `size` pixels, for a tile of side `tile`. A bigger size
 * shows the same tile with more detail (that's why the texture can grow with the zoom).
 * With `samples` = 2 each pixel averages four samples, so what is finer than a pixel
 * blends in instead of turning into noise (it costs four times as much). Returns the lit
 * tone of each pixel.
 */
export function sampleSurface(
  surface: Surface,
  tile: number,
  size: number,
  samples: 1 | 2 = 1,
): Float32Array {
  const n = size * samples;
  const step = tile / n;
  const pixel = tile / size;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      heights[j * n + i] = surface.height((i + 0.5) * step, (j + 0.5) * step, pixel);
    }
  }
  // Slope along the light's diagonal, per unit of the tile (the grid wraps around, like
  // the tile).
  const light = surface.relief / (2 * Math.SQRT2 * step);
  const share = 1 / (samples * samples);
  const shift = samples - 1;
  const out = new Float32Array(size * size);
  for (let j = 0; j < n; j++) {
    const up = wrap(j - 1, n) * n;
    const down = wrap(j + 1, n) * n;
    const row = (j >> shift) * size;
    for (let i = 0; i < n; i++) {
      const slope = heights[up + wrap(i - 1, n)] - heights[down + wrap(i + 1, n)];
      const value = surface.tone((i + 0.5) * step, (j + 0.5) * step, pixel) + slope * light;
      out[row + (i >> shift)] += value * share;
    }
  }
  return out;
}
