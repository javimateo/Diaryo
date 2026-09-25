import { fbm, hash, noise } from './noise';
import type { ThemeMode } from './palette';

export type DeskStyle = 'plain' | 'wood' | 'cork' | 'linen';

/** Mesas, en el orden en que se ofrecen. */
export const DESKS: Record<DeskStyle, string> = {
  plain: 'Lisa',
  wood: 'Madera',
  cork: 'Corcho',
  linen: 'Lino',
};

/** Lado de la textura, en píxeles. */
export const DESK_TILE = 512;

/** Unidades del mundo por píxel de cada textura (tablas anchas, gránulos pequeños…). */
export const DESK_SCALE: Record<DeskStyle, number> = {
  plain: 1,
  wood: 2.5,
  cork: 1.25,
  linen: 1,
};

type RGB = [number, number, number];

/** Colores de cada mesa: base y veta (o grano), de día y de noche. */
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

/** Color de fondo mientras no se ve la textura (y de lo que queda muy lejos). */
export function deskColor(style: DeskStyle, mode: ThemeMode): string | null {
  if (style === 'plain') return null;
  const [base, grain] = PALETTES[style][mode];
  const mix = base.map((v, i) => Math.round(v * 0.8 + grain[i] * 0.2));
  return `rgb(${mix.join(', ')})`;
}

const PLANK = DESK_TILE / 4;

/** Madera: tablas horizontales con su veta y sus juntas. Devuelve cuánta veta hay (0 a 1). */
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
  // Juntas entre tablas y el final de cada una (a un sitio distinto en cada tabla).
  const inPlank = y - plank * PLANK;
  if (inPlank < 1.5 || inPlank > PLANK - 1) grain = 0.95;
  const end = Math.floor(hash(plank, 1, 7) * DESK_TILE);
  if (Math.abs(x - end) < 1.2) grain = 0.9;
  return grain;
}

/** Corcho: gránulos de distintos tamaños y alguna mota oscura. */
function cork(x: number, y: number): number {
  const u = x / DESK_TILE;
  const v = y / DESK_TILE;
  const big = fbm(u, v, 64, 64, 2, 17);
  const small = noise(u * 160, v * 160, 160, 160, 23);
  let grain = 0.75 - (big * 0.6 + small * 0.4) * 0.9;
  if (hash(x, y, 41) > 0.992) grain += 0.35;
  return grain;
}

/** Lino: hilos cruzados muy finos, con irregularidades a lo largo de cada hilo. */
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

/** Píxeles (RGBA) de la textura de una mesa. */
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

/** La textura de la mesa (se hace una vez por mesa y tema), o null si es lisa. */
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

/** La textura como imagen (para el fondo del mapa y las muestras). */
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
