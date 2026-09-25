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

/** Maximum side when importing: larger images are scaled down (and take much less space). */
const MAX_SIDE = 2560;

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Reads an image file as a data URL, scaling it down if it is huge. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  try {
    if (scale === 1) return { src: await readAsDataUrl(file), width, height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL('image/webp', 0.9), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
