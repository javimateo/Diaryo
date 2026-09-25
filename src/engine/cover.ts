import { fbm, grayTexture, hash, noise } from './noise';

export type CoverMaterial = 'leather' | 'cloth' | 'kraft' | 'plain';

/** Cover materials, in the order they are offered. */
export const MATERIALS: CoverMaterial[] = ['leather', 'cloth', 'kraft', 'plain'];

/** Cardboard has its own color (the one chosen for the covers isn't used). */
export const KRAFT_COLOR = '#b58c5e';

/** Side of the grain texture, in pixels. */
const GRAIN_TILE = 256;
/** World units per grain pixel. */
export const GRAIN_SCALE = 2;

/** Leather: small, tight pores, with slightly lighter and darker areas. */
function leather(x: number, y: number): number {
  const u = x / GRAIN_TILE;
  const v = y / GRAIN_TILE;
  const pores = noise(u * 96, v * 96, 96, 96, 3);
  const fine = noise(u * 192, v * 192, 192, 192, 4);
  const tone = fbm(u, v, 4, 4, 2, 7);
  // The pores sink more than they stick out.
  const pore = pores < 0.35 ? (pores - 0.35) * 0.7 : (pores - 0.35) * 0.2;
  return 0.5 + pore + (fine - 0.5) * 0.12 + (tone - 0.5) * 0.22;
}

/** Cloth: threads crossing over and under, with irregularities. */
function cloth(x: number, y: number): number {
  const u = x / GRAIN_TILE;
  const v = y / GRAIN_TILE;
  const across = 0.5 + 0.5 * Math.sin((x * Math.PI * 2) / 4);
  const down = 0.5 + 0.5 * Math.sin((y * Math.PI * 2) / 4);
  const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
  const weave = over ? across : down;
  const slub = fbm(u, v, 8, 64, 2, 21);
  return 0.5 + (weave - 0.5) * 0.16 + (slub - 0.5) * 0.2;
}

/** Cardboard: short fibres and specks. */
function kraft(x: number, y: number): number {
  const u = x / GRAIN_TILE;
  const v = y / GRAIN_TILE;
  const base = fbm(u, v, 16, 16, 3, 31);
  const fibers = fbm(u, v, 64, 8, 2, 37) + fbm(u, v, 8, 64, 2, 41);
  const speck = hash(x, y, 43) > 0.988 ? -0.22 : 0;
  return 0.5 + (base - 0.5) * 0.3 + (fibers - 1) * 0.2 + speck;
}

const GRAIN = { leather, cloth, kraft };
const grains = new Map<CoverMaterial, HTMLCanvasElement>();

/** Material grain (grey: it blends with the cover color), or null if plain. */
export function coverGrain(material: CoverMaterial): HTMLCanvasElement | null {
  if (material === 'plain') return null;
  let texture = grains.get(material);
  if (!texture) {
    texture = grayTexture(GRAIN_TILE, GRAIN[material]);
    grains.set(material, texture);
  }
  return texture;
}

/** Lightens (> 0) or darkens (< 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `rgb(${channel(n >> 16)}, ${channel((n >> 8) & 255)}, ${channel(n & 255)})`;
}
