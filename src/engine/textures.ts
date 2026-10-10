import { texturePixels, tileSize, type TextureRequest } from './texturePixels';
import type { TextureJob } from './textureWorker';

export type { TextureRequest } from './texturePixels';

/** Side of the first texture, made right away; the bigger ones are made in the background. */
export const BASE_SIZE = 256;
/**
 * Side of the biggest one (16 MB, a few seconds to make). Closer than that it is enlarged:
 * the details are wide and soft enough not to show the pixels.
 */
const MAX_SIZE = 2048;
/** World units of the smallest pixel: finer, no detail would gain anything. */
const MIN_PIXEL = 0.5;
/** Textures whose big sizes are kept (the cover's and the desk's). */
const KEPT = 2;

/** A texture ready to paint: its tile and the world units each of its pixels measures. */
export interface Texture {
  canvas: HTMLCanvasElement;
  scale: number;
}

/**
 * The side the texture needs at `pixelScale` (screen pixels per world unit): enough for
 * each pixel of the texture to fall on no more than one of the screen.
 */
export function sizeFor(tile: number, pixelScale: number): number {
  let size = BASE_SIZE;
  while (size < MAX_SIZE && size * 2 * MIN_PIXEL <= tile && size < tile * pixelScale) size *= 2;
  return size;
}

const keyOf = (request: TextureRequest) =>
  request.kind === 'cover' ? `cover/${request.material}` : `desk/${request.style}/${request.mode}`;

/** The sizes made of each texture. */
const made = new Map<string, Map<number, HTMLCanvasElement>>();
/** The size each texture needs at the last zoom it was painted at. */
const wanted = new Map<string, number>();
/** Sizes asked of the worker, made or on their way (`key@size`). */
const asked = new Set<string>();
const listeners = new Set<() => void>();
/** Textures from the most recently used. */
let recent: string[] = [];
let worker: Worker | null | undefined;
/** Sizes waiting for the worker, oldest first (it makes one at a time). */
let waiting: TextureJob[] = [];
let busy = false;

function canvasOf(pixels: Uint8ClampedArray<ArrayBuffer>, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, size, size), 0, 0);
  return canvas;
}

function ready(job: TextureJob, pixels: Uint8ClampedArray<ArrayBuffer>) {
  busy = false;
  next();
  const sizes = made.get(job.key);
  if (!sizes || !asked.has(`${job.key}@${job.size}`)) return;
  sizes.set(job.size, canvasOf(pixels, job.size));
  // On to the next size up, if the zoom needs it (without waiting to paint this one).
  const want = wanted.get(job.key) ?? 0;
  if (job.size >= BASE_SIZE * 2 && job.size < want) ask(job.key, job.request, job.size * 2);
  listeners.forEach((listener) => listener());
}

/** The background worker, or null where there is none (tests) or it failed. */
function textureWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  worker = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (
    event: MessageEvent<TextureJob & { pixels: Uint8ClampedArray<ArrayBuffer> }>,
  ) => ready(event.data, event.data.pixels);
  // Without it, the first texture stays (it is good enough from afar).
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    waiting = [];
  };
  return worker;
}

/**
 * Gives the worker the next size: first the smoothed first sizes, then the last one asked
 * for. The others of the same texture are dropped: while zooming, the sizes asked for on
 * the way are no longer needed (they are asked for again if they are).
 */
function next() {
  const target = textureWorker();
  if (busy || !target || waiting.length === 0) return;
  const job = waiting.find((j) => j.size === BASE_SIZE) ?? waiting[waiting.length - 1];
  const stale = (j: TextureJob) => j !== job && j.key === job.key && j.size !== BASE_SIZE;
  waiting.filter(stale).forEach((j) => asked.delete(`${j.key}@${j.size}`));
  waiting = waiting.filter((j) => j !== job && !stale(j));
  busy = true;
  target.postMessage(job);
}

/** Asks the worker for a size (smoothed if it is small: there, details are finer than a pixel). */
function ask(key: string, request: TextureRequest, size: number) {
  const id = `${key}@${size}`;
  if (asked.has(id) || !textureWorker()) return;
  asked.add(id);
  waiting.push({ key, request, size, samples: size <= 512 ? 2 : 1 });
  next();
}

/** Remembers that it has been used; the big sizes of the oldest ones are let go. */
function touch(key: string) {
  if (recent[0] === key) return;
  recent = [key, ...recent.filter((k) => k !== key)];
  for (const old of recent.slice(KEPT)) {
    made.get(old)?.forEach((_, size) => {
      if (size === BASE_SIZE) return;
      made.get(old)!.delete(size);
      asked.delete(`${old}@${size}`);
    });
  }
}

/** The sizes made of a texture: the first time, the first one, made right away. */
function sizesOf(key: string, request: TextureRequest): Map<number, HTMLCanvasElement> {
  let sizes = made.get(key);
  if (!sizes) {
    const first = canvasOf(texturePixels(request, BASE_SIZE, 1), BASE_SIZE);
    sizes = new Map([[BASE_SIZE, first]]);
    made.set(key, sizes);
  }
  return sizes;
}

/**
 * The texture to paint at `pixelScale`. The first time it is made right away at the
 * smallest size; the size the zoom needs comes later (`onTextureReady` says when), and
 * meanwhile the closest smaller one is used.
 */
export function texture(request: TextureRequest, pixelScale: number): Texture {
  const key = keyOf(request);
  const sizes = sizesOf(key, request);
  // A smoother one of the first size, for when it is seen from afar.
  ask(key, request, BASE_SIZE);
  touch(key);
  const want = sizeFor(tileSize(request), pixelScale);
  wanted.set(key, want);
  let canvas = sizes.get(want);
  if (!canvas) {
    // Meanwhile, the biggest of the smaller ones (there is always the first one); the next
    // size up is made first, so it gets sharper step by step instead of all at the end.
    const best = Math.max(...[...sizes.keys()].filter((size) => size < want));
    ask(key, request, best * 2);
    canvas = sizes.get(best)!;
  }
  return { canvas, scale: tileSize(request) / canvas.width };
}

/** Calls `listener` whenever a texture gets better. Returns how to stop. */
export function onTextureReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const images = new WeakMap<HTMLCanvasElement, string>();

/** The texture as an image, as seen from afar (the map background, the swatches). */
export function textureImage(request: TextureRequest): string {
  const canvas = sizesOf(keyOf(request), request).get(BASE_SIZE)!;
  let url = images.get(canvas);
  if (!url) {
    url = canvas.toDataURL('image/webp', 0.9);
    images.set(canvas, url);
  }
  return url;
}

const previews = new Map<string, string>();

/** A small image of the texture, `size` pixels for its whole tile (the swatches). */
export function texturePreview(request: TextureRequest, size: number): string {
  const key = `${keyOf(request)}@${size}`;
  let url = previews.get(key);
  if (!url) {
    url = canvasOf(texturePixels(request, size, 1), size).toDataURL('image/webp', 0.9);
    previews.set(key, url);
  }
  return url;
}
