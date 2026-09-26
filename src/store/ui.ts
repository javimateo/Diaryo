import { create } from 'zustand';
import { DEFAULT_BOOK_STYLE, isPaperStyle, PAPER_COLORS, type BookStyle } from '../engine/book';
import { MATERIALS } from '../engine/cover';
import { DESKS } from '../engine/desk';
import type { ToolStyles } from '../engine/elements';
import type { ContextMenuRequest, EditingState, Engine, EngineState } from '../engine/engine';
import type { HexColor } from '../engine/palette';
import type { ToolId } from '../engine/tools';
import type { DesktopBridge } from '../desktop/bridge';
import type { DesktopInfo } from '../desktop/settings';
import type { Diary, DiaryState, TurnSpeed } from '../diary/diary';
import type { SaveStatus } from '../storage/autosave';
import { mergeToolStyle, parseRecentColors, parseStyles, RECENT_COLORS_LIMIT } from './styles';
import { asRecord, readJSON, readText, writeJSON, writeText } from '../lib/saved';
import { DEFAULT_LANGUAGE, isLanguage, setLanguage, type Language } from '../i18n';

export type Theme = 'light' | 'dark';
/** The chosen theme: light, dark or the system one (and it follows it). */
export type ThemePreference = Theme | 'system';

/** App settings (the diary look is separate, in `bookStyle`). */
export interface Settings {
  /** App language. */
  language: Language;
  /** Day the week starts on in the calendar: 1 = Monday, 0 = Sunday. */
  weekStart: 0 | 1;
  turnSpeed: TurnSpeed;
  /** Desktop app: new versions install by themselves (while the diary is hidden). */
  autoUpdate: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  language: DEFAULT_LANGUAGE,
  weekStart: 1,
  turnSpeed: 'normal',
  autoUpdate: true,
};

export const THEME_KEY = 'diaryo:theme';
export const SETTINGS_KEY = 'diaryo:settings';
const STYLES_KEY = 'diaryo:styles';
const RECENT_COLORS_KEY = 'diaryo:recent-colors';
const BOOK_KEY = 'diaryo:book';
const TOAST_DURATION = 1800;
/** Toasts with a button (e.g. "Undo") last longer to leave time to press it. */
const ACTION_TOAST_DURATION = 6000;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function loadThemePreference(): ThemePreference {
  const saved = readText(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

const resolveTheme = (preference: ThemePreference): Theme =>
  preference === 'system' ? (systemDark.matches ? 'dark' : 'light') : preference;

function loadSettings(): Settings {
  const saved = asRecord(readJSON(SETTINGS_KEY));
  const settings = { ...DEFAULT_SETTINGS };
  if (isLanguage(saved.language)) settings.language = saved.language;
  if (saved.weekStart === 0 || saved.weekStart === 1) settings.weekStart = saved.weekStart;
  if (saved.turnSpeed === 'normal' || saved.turnSpeed === 'fast' || saved.turnSpeed === 'off') {
    settings.turnSpeed = saved.turnSpeed;
  }
  if (typeof saved.autoUpdate === 'boolean') settings.autoUpdate = saved.autoUpdate;
  return settings;
}

/** Is it one of those values? */
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.includes(value as T);

/** Is it one of the keys of that catalog? */
const isKeyOf = <T extends string>(catalog: Record<T, unknown>, value: unknown): value is T =>
  typeof value === 'string' && Object.hasOwn(catalog, value);

/** Saved diary look (with defaults for whatever is missing). */
function loadBookStyle(): BookStyle {
  const saved = asRecord(readJSON(BOOK_KEY));
  const style = { ...DEFAULT_BOOK_STYLE };
  if (isPaperStyle(saved.paper)) style.paper = saved.paper;
  if (isOneOf(MATERIALS, saved.material)) style.material = saved.material;
  if (typeof saved.elastic === 'boolean') style.elastic = saved.elastic;
  // Before cover materials existed the desk was plain by default: now it is wood.
  if (isOneOf(DESKS, saved.desk) && 'material' in saved) style.desk = saved.desk;
  if (saved.binding === 'rings' || saved.binding === 'sewn') style.binding = saved.binding;
  if (isKeyOf(PAPER_COLORS, saved.paperColor)) style.paperColor = saved.paperColor;
  if (typeof saved.cover === 'string' && /^#[0-9a-f]{6}$/i.test(saved.cover)) {
    style.cover = saved.cover;
  }
  return style;
}

/** Activates the language for the texts and for the browser (screen readers, spell checker). */
function applyLanguage(language: Language) {
  setLanguage(language);
  document.documentElement.lang = language;
}

const initialSettings = loadSettings();
applyLanguage(initialSettings.language);

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
  /** Custom colors used recently, to get back to them quickly. */
  recentColors: HexColor[];
  zoom: number;
  doc: EngineState;
  /** Text or note being written. */
  editing: EditingState | null;
  /** Theme shown now (the system one already resolved). */
  theme: Theme;
  themePreference: ThemePreference;
  settings: Settings;
  settingsOpen: boolean;
  helpOpen: boolean;
  saveStatus: SaveStatus;
  diary: Diary | null;
  diaryState: DiaryState;
  /** Diary index (calendar and pages) open. */
  diaryOpen: boolean;
  bookStyle: BookStyle;
  /** Dialog to choose the page to link the selection to. */
  linkDialogOpen: boolean;
  /** Map view: all the pages at a glance. */
  mapOpen: boolean;
  /** Command palette and search (Ctrl+K). */
  paletteOpen: boolean;
  /** Desktop app: mode, shortcut, backups… (null on the web). */
  desktop: DesktopInfo | null;
  /** The connection with the desktop side (null on the web). */
  desktopBridge: DesktopBridge | null;
  /** Where the book was on screen when the map opened (the sheet flies from there). */
  mapOrigin: { x: number; y: number; width: number; height: number } | null;
  /** Right-click menu open. */
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
  /** Reads the saved settings again (another window changed them). */
  reloadSettings: () => void;
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
  setDesktopBridge: (bridge: DesktopBridge | null) => void;
  openContextMenu: (request: ContextMenuRequest) => void;
  closeContextMenu: () => void;
  showToast: (message: string, action?: ToastAction) => void;
  hideToast: () => void;
}

export const useUI = create<UIState>()((set, get) => ({
  engine: null,
  tool: 'select',
  styles: parseStyles(readText(STYLES_KEY)),
  recentColors: parseRecentColors(readText(RECENT_COLORS_KEY)),
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
  settings: initialSettings,
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
  desktopBridge: null,
  contextMenu: null,
  toast: null,
  setEngine: (engine) => set({ engine }),
  setTool: (tool) => set({ tool }),
  setToolStyle: (tool, patch) => {
    const styles = mergeToolStyle(get().styles, tool, patch);
    writeJSON(STYLES_KEY, styles);
    set({ styles });
  },
  addRecentColor: (color) => {
    const lower = color.toLowerCase() as HexColor;
    const recentColors = [lower, ...get().recentColors.filter((c) => c !== lower)].slice(
      0,
      RECENT_COLORS_LIMIT,
    );
    writeJSON(RECENT_COLORS_KEY, recentColors);
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
    writeText(THEME_KEY, themePreference);
    set({ theme, themePreference });
  },
  reloadSettings: () => {
    const settings = loadSettings();
    applyLanguage(settings.language);
    set({ settings });
  },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    applyLanguage(settings.language);
    writeJSON(SETTINGS_KEY, settings);
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
    // The open page's thumbnail, up to date; the map sheet flies from where the book is.
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
  setDesktopBridge: (desktopBridge) => set({ desktopBridge }),
  setBookStyle: (patch) => {
    const bookStyle = { ...get().bookStyle, ...patch };
    writeJSON(BOOK_KEY, bookStyle);
    set({ bookStyle });
    get().diary?.refreshBook();
  },
  setDiaryOpen: (diaryOpen) => {
    // When opening the index, the current page's thumbnail is brought up to date.
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

// With the system theme, the app changes as soon as the system does.
systemDark.addEventListener('change', () => {
  const { themePreference, setThemePreference } = useUI.getState();
  if (themePreference === 'system') setThemePreference('system');
});
