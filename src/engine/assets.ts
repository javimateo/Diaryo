import { createId } from './elements';

interface Asset {
  src: string;
  image: HTMLImageElement;
  ready: boolean;
}

/**
 * The page's images. Elements only store the id: that way duplicating or copying an image
 * doesn't duplicate its data.
 */
export class AssetStore {
  private readonly assets = new Map<string, Asset>();

  /** Called with each new image (the autosave uses it). */
  onAdd: (id: string, src: string) => void = () => {};

  constructor(private readonly onLoad: () => void) {}

  /**
   * Registers an image (data URL) and returns its id. If the id already exists, it does
   * nothing. Without `notify` nobody is told (e.g. already saved images from other
   * pages).
   */
  add(src: string, id: string = createId(), notify = true): string {
    if (this.assets.has(id)) return id;
    const image = new Image();
    const asset: Asset = { src, image, ready: false };
    image.onload = () => {
      asset.ready = true;
      this.onLoad();
    };
    image.src = src;
    this.assets.set(id, asset);
    if (notify) this.onAdd(id, src);
    return id;
  }

  /** Waits until the images are ready to draw (those that fail are ignored). */
  async whenReady(ids: Iterable<string>): Promise<void> {
    await Promise.all(
      [...ids].map((id) =>
        this.assets
          .get(id)
          ?.image.decode()
          .catch(() => undefined),
      ),
    );
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  src(id: string): string | undefined {
    return this.assets.get(id)?.src;
  }

  /** The image ready to paint, or null if it is still loading. */
  image(id: string): HTMLImageElement | null {
    const asset = this.assets.get(id);
    return asset?.ready ? asset.image : null;
  }
}

/**
 * How images are kept: at most this side, as WebP with this quality. A phone photo goes
 * from several MB to a few hundred KB, with no visible loss at the size it is drawn.
 */
const MAX_SIDE = 2048;
const QUALITY = 0.85;
/** Files this small are kept as they are (they are light already). */
const KEEP_BELOW = 200 * 1024;
/** Formats that are kept as they are: re-encoding would lose the animation or the vectors. */
const KEEP_TYPES = new Set(['image/gif', 'image/svg+xml']);

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Draws an image at most `MAX_SIDE` wide or high, as WebP. */
function encode(source: CanvasImageSource, width: number, height: number): LoadedImage {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return {
    src: canvas.toDataURL('image/webp', QUALITY),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Reads an image file as a data URL, made smaller unless it is light already. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  try {
    const fits = Math.max(width, height) <= MAX_SIDE;
    if (KEEP_TYPES.has(file.type) || (fits && file.size <= KEEP_BELOW)) {
      return { src: await readAsDataUrl(file), width, height };
    }
    const encoded = encode(bitmap, width, height);
    // A small image that WebP doesn't make smaller stays as it was.
    if (fits) {
      const original = await readAsDataUrl(file);
      if (original.length <= encoded.src.length) return { src: original, width, height };
    }
    return encoded;
  } finally {
    bitmap.close();
  }
}

/**
 * The same image, smaller (for images saved before they were compressed). Returns null
 * if it can't be made smaller.
 */
export async function shrinkImage(src: string): Promise<string | null> {
  if (/^data:image\/(gif|svg)/.test(src)) return null;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const encoded = encode(image, image.naturalWidth, image.naturalHeight);
  return encoded.src.length < src.length ? encoded.src : null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
