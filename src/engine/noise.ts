/**
 * Ruido para texturas hechas por el programa (mesa, tapas). Se repite cada cierto número
 * de celdas, así las texturas no tienen costuras al ponerlas una junto a otra.
 */

export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (i: number, period: number) => ((i % period) + period) % period;

/** Ruido suave en una rejilla que se repite cada `px` × `py` celdas (0 a 1). */
export function noise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ax = wrap(x0, px);
  const bx = wrap(x0 + 1, px);
  const ay = wrap(y0, py);
  const by = wrap(y0 + 1, py);
  const a = hash(ax, ay, seed);
  const b = hash(bx, ay, seed);
  const c = hash(ax, by, seed);
  const d = hash(bx, by, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Varias capas de ruido, cada una el doble de fina (0 a 1). `u` y `v` van de 0 a 1 en
 * la textura; `cx` × `cy` son las celdas de la primera capa.
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

/** Una textura en escala de grises (128 = sin cambio) como canvas, a partir de su valor en cada píxel. */
export function grayTexture(size: number, valueAt: (x: number, y: number) => number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(Math.min(1, Math.max(0, valueAt(x, y))) * 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  canvas.getContext('2d')!.putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}
