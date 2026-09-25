import { createId } from './elements';

interface Asset {
  src: string;
  image: HTMLImageElement;
  ready: boolean;
}

/**
 * Imágenes de la página. Los elementos solo guardan el id: así duplicar o copiar una
 * imagen no duplica sus datos.
 */
export class AssetStore {
  private readonly assets = new Map<string, Asset>();

  /** Se llama con cada imagen nueva (lo usa el autoguardado). */
  onAdd: (id: string, src: string) => void = () => {};

  constructor(private readonly onLoad: () => void) {}

  /**
   * Registra una imagen (data URL) y devuelve su id. Si el id ya existe, no hace nada.
   * Sin `notify` no se avisa (p. ej. imágenes ya guardadas de otras páginas).
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

  /** Espera a que las imágenes estén listas para dibujarse (las que fallen, se ignoran). */
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

  /** La imagen lista para pintar, o null si aún se está cargando. */
  image(id: string): HTMLImageElement | null {
    const asset = this.assets.get(id);
    return asset?.ready ? asset.image : null;
  }
}

/** Lado máximo al importar: las imágenes más grandes se reducen (y ocupan mucho menos). */
const MAX_SIDE = 2560;

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Lee un archivo de imagen como data URL, reduciéndolo si es enorme. */
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
