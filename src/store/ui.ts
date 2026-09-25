import { create } from 'zustand';
import { DEFAULT_BOOK_STYLE, isPaperStyle, PAPER_COLORS, type BookStyle } from '../engine/book';
import { MATERIALS } from '../engine/cover';
import { DESKS } from '../engine/desk';
import type { ToolStyles } from '../engine/elements';
import type { ContextMenuRequest, EditingState, Engine, EngineState } from '../engine/engine';
import type { HexColor } from '../engine/palette';
import type { ToolId } from '../engine/tools';
import type { DesktopInfo } from '../desktop/desktop';
import type { Diary, DiaryState, TurnSpeed } from '../diary/diary';
import type { SaveStatus } from '../storage/autosave';
import { mergeToolStyle, parseRecentColors, parseStyles, RECENT_COLORS_LIMIT } from './styles';

export type Theme = 'light' | 'dark';
/** El tema elegido: claro, oscuro o el del sistema (y cambia con él). */
export type ThemePreference = Theme | 'system';

/** Ajustes de la app (lo del aspecto del diario va aparte, en `bookStyle`). */
export interface Settings {
  /** Día con el que empieza la semana en el calendario: 1 = lunes, 0 = domingo. */
  weekStart: 0 | 1;
  turnSpeed: TurnSpeed;
}

const DEFAULT_SETTINGS: Settings = { weekStart: 1, turnSpeed: 'normal' };

export const THEME_KEY = 'diaryo:theme';
const SETTINGS_KEY = 'diaryo:settings';
const STYLES_KEY = 'diaryo:styles';
const RECENT_COLORS_KEY = 'diaryo:recent-colors';
const BOOK_KEY = 'diaryo:book';
const TOAST_DURATION = 1800;
/** Los avisos con botón (p. ej. "Deshacer") duran más para dar tiempo a pulsarlo. */
const ACTION_TOAST_DURATION = 6000;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Sin almacenamiento (modo privado, etc.): se usan los valores por defecto.
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // No es crítico.
  }
}

const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function loadThemePreference(): ThemePreference {
  const saved = readStorage(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

const resolveTheme = (preference: ThemePreference): Theme =>
  preference === 'system' ? (systemDark.matches ? 'dark' : 'light') : preference;

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(readStorage(SETTINGS_KEY) ?? '{}');
    const settings = { ...DEFAULT_SETTINGS };
    if (saved.weekStart === 0 || saved.weekStart === 1) settings.weekStart = saved.weekStart;
    if (['normal', 'fast', 'off'].includes(saved.turnSpeed)) settings.turnSpeed = saved.turnSpeed;
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Aspecto del diario guardado (con valores por defecto para lo que falte). */
function loadBookStyle(): BookStyle {
  try {
    const saved = JSON.parse(readStorage(BOOK_KEY) ?? '{}');
    const style = { ...DEFAULT_BOOK_STYLE };
    if (isPaperStyle(saved.paper)) style.paper = saved.paper;
    if (Object.hasOwn(MATERIALS, saved.material)) style.material = saved.material;
    if (typeof saved.elastic === 'boolean') style.elastic = saved.elastic;
    // Antes de haber materiales la mesa era lisa por defecto: ahora es de madera.
    if (Object.hasOwn(DESKS, saved.desk) && 'material' in saved) style.desk = saved.desk;
    if (['rings', 'sewn'].includes(saved.binding)) style.binding = saved.binding;
    if (Object.hasOwn(PAPER_COLORS, saved.paperColor)) style.paperColor = saved.paperColor;
    if (/^#[0-9a-f]{6}$/i.test(saved.cover)) style.cover = saved.cover;
    return style;
  } catch {
    return { ...DEFAULT_BOOK_STYLE };
  }
}

const initialPreference = loadThemePreference();
const initialTheme = resolveTheme(initialPreference);
document.documentElement.dataset.theme = initialTheme;

export interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  message: string;
  action?: ToastAction;
  visible: boolean;
}

interface UIState {
  engine: Engine | null;
  tool: ToolId;
  styles: ToolStyles;
  /** Colores libres usados hace poco, para volver a ellos rápido. */
  recentColors: HexColor[];
  zoom: number;
  doc: EngineState;
  /** Texto o nota que se está escribiendo. */
  editing: EditingState | null;
  /** Tema que se ve ahora (el del sistema ya resuelto). */
  theme: Theme;
  themePreference: ThemePreference;
  settings: Settings;
  settingsOpen: boolean;
  helpOpen: boolean;
  saveStatus: SaveStatus;
  diary: Diary | null;
  diaryState: DiaryState;
  /** Índice del diario (calendario y páginas) abierto. */
  diaryOpen: boolean;
  bookStyle: BookStyle;
  /** Diálogo para elegir la página a la que enlazar lo seleccionado. */
  linkDialogOpen: boolean;
  /** Vista mapa: todas las páginas de un vistazo. */
  mapOpen: boolean;
  /** Paleta de comandos y búsqueda (Ctrl+K). */
  paletteOpen: boolean;
  /** App de escritorio: modo, atajo, copias… (null en la web). */
  desktop: DesktopInfo | null;
  /** Dónde estaba el libro en la pantalla al abrir el mapa (la hoja sale de ahí). */
  mapOrigin: { x: number; y: number; width: number; height: number } | null;
  /** Menú del clic derecho abierto. */
  contextMenu: ContextMenuRequest | null;
  toast: Toast | null;
  setEngine: (engine: Engine | null) => void;
  setTool: (tool: ToolId) => void;
  setToolStyle: <K extends keyof ToolStyles>(tool: K, patch: Partial<ToolStyles[K]>) => void;
  addRecentColor: (color: HexColor) => void;
  setZoom: (zoom: number) => void;
  setDoc: (doc: EngineState) => void;
  setEditing: (editing: EditingState | null) => void;
  toggleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setDiary: (diary: Diary | null) => void;
  setDiaryState: (state: DiaryState) => void;
  setDiaryOpen: (open: boolean) => void;
  setBookStyle: (patch: Partial<BookStyle>) => void;
  setLinkDialogOpen: (open: boolean) => void;
  setMapOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setDesktop: (patch: Partial<DesktopInfo>) => void;
  openContextMenu: (request: ContextMenuRequest) => void;
  closeContextMenu: () => void;
  showToast: (message: string, action?: ToastAction) => void;
  hideToast: () => void;
}

export const useUI = create<UIState>()((set, get) => ({
  engine: null,
  tool: 'select',
  styles: parseStyles(readStorage(STYLES_KEY)),
  recentColors: parseRecentColors(readStorage(RECENT_COLORS_KEY)),
  zoom: 1,
  doc: {
    canUndo: false,
    canRedo: false,
    isEmpty: true,
    selectionCount: 0,
    selectionStyle: null,
    selectionGrouped: false,
    selectionLocked: false,
    hasLocked: false,
    hasCopiedStyle: false,
    selectionHasLink: false,
    selectionLink: null,
  },
  editing: null,
  theme: initialTheme,
  themePreference: initialPreference,
  settings: loadSettings(),
  settingsOpen: false,
  helpOpen: false,
  saveStatus: 'loading',
  diary: null,
  diaryState: { pages: [], current: null },
  diaryOpen: false,
  bookStyle: loadBookStyle(),
  linkDialogOpen: false,
  mapOpen: false,
  mapOrigin: null,
  paletteOpen: false,
  desktop: null,
  contextMenu: null,
  toast: null,
  setEngine: (engine) => set({ engine }),
  setTool: (tool) => set({ tool }),
  setToolStyle: (tool, patch) => {
    const styles = mergeToolStyle(get().styles, tool, patch);
    writeStorage(STYLES_KEY, JSON.stringify(styles));
    set({ styles });
  },
  addRecentColor: (color) => {
    const lower = color.toLowerCase() as HexColor;
    const recentColors = [lower, ...get().recentColors.filter((c) => c !== lower)].slice(
      0,
      RECENT_COLORS_LIMIT,
    );
    writeStorage(RECENT_COLORS_KEY, JSON.stringify(recentColors));
    set({ recentColors });
  },
  setZoom: (zoom) => {
    if (get().zoom !== zoom) set({ zoom });
  },
  setDoc: (doc) => set({ doc }),
  setEditing: (editing) => set({ editing }),
  toggleTheme: () => get().setThemePreference(get().theme === 'dark' ? 'light' : 'dark'),
  setThemePreference: (themePreference) => {
    const theme = resolveTheme(themePreference);
    document.documentElement.dataset.theme = theme;
    writeStorage(THEME_KEY, themePreference);
    set({ theme, themePreference });
  },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    writeStorage(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen, contextMenu: null }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setDiary: (diary) => set({ diary }),
  setDiaryState: (diaryState) => set({ diaryState }),
  setLinkDialogOpen: (linkDialogOpen) => set({ linkDialogOpen }),
  setMapOpen: (mapOpen) => {
    if (mapOpen === get().mapOpen) return;
    const { diary, engine } = get();
    // La miniatura de la página abierta, al día; la hoja del mapa sale de donde está el libro.
    if (mapOpen) diary?.refreshThumbnail();
    set({
      mapOpen,
      mapOrigin: mapOpen ? (engine?.bookScreenRect() ?? null) : null,
      diaryOpen: false,
    });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen, contextMenu: null }),
  setDesktop: (patch) => {
    const desktop = get().desktop;
    set({ desktop: desktop ? { ...desktop, ...patch } : (patch as DesktopInfo) });
  },
  setBookStyle: (patch) => {
    const bookStyle = { ...get().bookStyle, ...patch };
    writeStorage(BOOK_KEY, JSON.stringify(bookStyle));
    set({ bookStyle });
    get().diary?.refreshBook();
  },
  setDiaryOpen: (diaryOpen) => {
    // Al abrir el índice, la miniatura de la página actual se pone al día.
    if (diaryOpen) get().diary?.refreshThumbnail();
    set({ diaryOpen });
  },
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  showToast: (message, action) => {
    clearTimeout(toastTimer);
    set({ toast: { message, action, visible: true } });
    toastTimer = setTimeout(get().hideToast, action ? ACTION_TOAST_DURATION : TOAST_DURATION);
  },
  hideToast: () => {
    clearTimeout(toastTimer);
    const toast = get().toast;
    if (toast?.visible) set({ toast: { ...toast, visible: false } });
  },
}));

// Con el tema del sistema, la app cambia en cuanto cambia el sistema.
systemDark.addEventListener('change', () => {
  const { themePreference, setThemePreference } = useUI.getState();
  if (themePreference === 'system') setThemePreference('system');
});
