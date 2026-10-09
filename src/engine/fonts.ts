/**
 * Available fonts: a free (OFL) selection bundled with the app and the ones the user
 * uploads. Elements only store the font id.
 */
export type FontCategory = 'sans' | 'hand' | 'serif' | 'mono' | 'display' | 'custom';

export interface FontDef {
  id: string;
  name: string;
  /** CSS family name (in quotes). */
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
  { id: 'kalam', name: 'Kalam', family: '"Kalam"', category: 'hand' },
  {
    id: 'shadows-into-light',
    name: 'Shadows Into Light',
    family: '"Shadows Into Light"',
    category: 'hand',
  },
  {
    id: 'dancing-script',
    name: 'Dancing Script',
    family: '"Dancing Script Variable"',
    category: 'hand',
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    family: '"Playfair Display Variable"',
    category: 'serif',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    family: '"Merriweather Variable"',
    category: 'serif',
  },
  { id: 'amatic-sc', name: 'Amatic SC', family: '"Amatic SC"', category: 'display' },
  { id: 'pacifico', name: 'Pacifico', family: '"Pacifico"', category: 'display' },
  { id: 'space-mono', name: 'Space Mono', family: '"Space Mono"', category: 'mono' },
];

const FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

interface CustomFont extends FontDef {
  /** Font file as a data URL (to save and copy it). */
  src: string;
}

type Listener = () => void;

class FontRegistry {
  private readonly custom = new Map<string, CustomFont>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  /** Changes with each font loaded or added (so React notices). */
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

  /** Value for `ctx.font` / CSS `font-family`, with fallbacks in case it doesn't load. */
  stack(id: string): string {
    return `${this.get(id).family}, ${FALLBACK}`;
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  /**
   * Makes sure the font is loaded before measuring or painting with it. Tells the
   * listeners when it finishes (to measure and redraw again).
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

  /**
   * Its bold or italic (their own files, for most fonts): loaded the first time they are
   * drawn, and then the listeners know (to measure and redraw with them).
   */
  loadStyle(id: string, bold: boolean, italic: boolean): void {
    if (!bold && !italic) return;
    const key = `${id}|${bold ? 'b' : ''}${italic ? 'i' : ''}`;
    if (this.loaded.has(key) || this.pending.has(key)) return;
    const promise = document.fonts
      .load(`${italic ? 'italic ' : ''}${bold ? 700 : 400} 100px ${this.get(id).family}`, 'AaÑñ')
      .catch(() => [])
      .then(() => {
        this.loaded.add(key);
        this.pending.delete(key);
        this.emit();
      });
    this.pending.set(key, promise);
  }

  /** Registers a font uploaded by the user. Returns its id. */
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

  /** Fonts uploaded by the user, with their file. */
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

/** Font extensions that can be uploaded. */
export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2';

/** Reads a font file, registers it and returns its id. */
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
