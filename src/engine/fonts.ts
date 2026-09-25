/**
 * Fuentes disponibles: una selección libre (OFL) incluida en la app y las que suba
 * el usuario. Los elementos guardan solo el id de la fuente.
 */
export type FontCategory = 'sans' | 'hand' | 'serif' | 'mono' | 'display' | 'custom';

export interface FontDef {
  id: string;
  name: string;
  /** Nombre de familia CSS (entre comillas). */
  family: string;
  category: FontCategory;
}

export const DEFAULT_FONT = 'inter';

export const BUILTIN_FONTS: FontDef[] = [
  { id: 'inter', name: 'Inter', family: '"Inter Variable"', category: 'sans' },
  { id: 'nunito', name: 'Nunito', family: '"Nunito Variable"', category: 'sans' },
  { id: 'caveat', name: 'Caveat', family: '"Caveat Variable"', category: 'hand' },
  { id: 'patrick-hand', name: 'Patrick Hand', family: '"Patrick Hand"', category: 'hand' },
  { id: 'comic-neue', name: 'Comic Neue', family: '"Comic Neue"', category: 'hand' },
  { id: 'lora', name: 'Lora', family: '"Lora Variable"', category: 'serif' },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    family: '"JetBrains Mono Variable"',
    category: 'mono',
  },
  { id: 'lilita-one', name: 'Lilita One', family: '"Lilita One"', category: 'display' },
];

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sin serifa',
  hand: 'Manuscrita',
  serif: 'Con serifa',
  mono: 'Monoespaciada',
  display: 'Títulos',
  custom: 'Tus fuentes',
};

const FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

interface CustomFont extends FontDef {
  /** Archivo de la fuente como data URL (para guardarla y copiarla). */
  src: string;
}

type Listener = () => void;

class FontRegistry {
  private readonly custom = new Map<string, CustomFont>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  /** Cambia con cada fuente cargada o añadida (para que React se entere). */
  version = 0;

  all(): FontDef[] {
    return [...BUILTIN_FONTS, ...this.custom.values()];
  }

  get(id: string): FontDef {
    return BUILTIN_FONTS.find((f) => f.id === id) ?? this.custom.get(id) ?? BUILTIN_FONTS[0];
  }

  has(id: string): boolean {
    return BUILTIN_FONTS.some((f) => f.id === id) || this.custom.has(id);
  }

  /** Valor para `ctx.font` / CSS `font-family`, con alternativas por si no carga. */
  stack(id: string): string {
    return `${this.get(id).family}, ${FALLBACK}`;
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  /**
   * Garantiza que la fuente esté cargada antes de medir o pintar con ella. Avisa a
   * los oyentes cuando termina (para volver a medir y redibujar).
   */
  load(id: string): Promise<void> {
    if (this.loaded.has(id)) return Promise.resolve();
    let promise = this.pending.get(id);
    if (!promise) {
      const family = this.get(id).family;
      promise = document.fonts
        .load(`400 100px ${family}`, 'AaÑñ')
        .catch(() => [])
        .then(() => {
          this.loaded.add(id);
          this.pending.delete(id);
          this.emit();
        });
      this.pending.set(id, promise);
    }
    return promise;
  }

  /** Registra una fuente subida por el usuario. Devuelve su id. */
  async addCustom(
    name: string,
    src: string,
    id = `custom-${crypto.randomUUID()}`,
  ): Promise<string> {
    if (this.custom.has(id)) return id;
    const cssName = `diaryo-${id}`;
    const face = new FontFace(cssName, `url(${src})`);
    await face.load();
    document.fonts.add(face);
    this.custom.set(id, { id, name, family: `"${cssName}"`, category: 'custom', src });
    this.loaded.add(id);
    this.emit();
    return id;
  }

  /** Fuentes subidas por el usuario, con su archivo. */
  customFonts(): { id: string; name: string; src: string }[] {
    return [...this.custom.values()].map(({ id, name, src }) => ({ id, name, src }));
  }

  customSrc(id: string): { name: string; src: string } | undefined {
    const font = this.custom.get(id);
    return font && { name: font.name, src: font.src };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
}

export const fonts = new FontRegistry();

/** Extensiones de fuente que se pueden subir. */
export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2';

/** Lee un archivo de fuente, lo registra y devuelve su id. */
export async function uploadFontFile(file: File): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ');
  return fonts.addCustom(name, src);
}
