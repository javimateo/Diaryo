import { DEFAULT_BOOK_STYLE, isPaperStyle, PAPER_COLORS, type BookStyle } from '../engine/book';
import { MATERIALS } from '../engine/cover';
import { DESKS } from '../engine/desk';
import type { TurnSpeed } from '../diary/diary';
import { DEFAULT_LANGUAGE, isLanguage, setLanguage, type Language } from '../i18n';
import { asRecord, readJSON, readText, writeJSON, writeText } from '../lib/saved';
import type { Slice } from './ui';

/** The app's look and settings: the theme, the settings and the diary's look, all saved. */

export type Theme = 'light' | 'dark';

/** The chosen theme: light, dark or the system one (and it follows it). */
export type ThemePreference = Theme | 'system';

/**
 * How the cloud diary syncs on this device: by itself, only when asked, or only when
 * asked and with the diary password each time (the keys aren't kept here).
 */
export type SyncMode = 'auto' | 'manual' | 'password';

/** App settings (the diary look is separate, in `bookStyle`). */
export interface Settings {
  /** App language. */
  language: Language;
  /** Day the week starts on in the calendar: 1 = Monday, 0 = Sunday. */
  weekStart: 0 | 1;
  turnSpeed: TurnSpeed;
  /** Desktop app: new versions install by themselves (while the diary is hidden). */
  autoUpdate: boolean;
  syncMode: SyncMode;
  /** How long a private note stays shown (seconds) before it hides again by itself. */
  hidePrivate: HidePrivate;
  /** All the private notes hide when the diary is put away (minimized, or to the tray). */
  hidePrivateAway: boolean;
  /** The private notes on the Windows desktop: with their padlock, or not drawn at all. */
  deskPrivate: 'lock' | 'hide';
  /** The desktop mini diary while the whole diary is locked: its cover, or nothing. */
  miniLocked: 'cover' | 'hide';
  /** The whole diary locks after these minutes without using it (0: never). */
  autoLock: AutoLock;
  /** The whole diary locks when it is put away (another tab, minimized, the tray). */
  lockAway: boolean;
  /** Desktop app: a Windows notification for each task and appointment with a date. */
  reminders: boolean;
  /** How many minutes before its time it reminds. */
  remindBefore: RemindBefore;
}

export const REMIND_BEFORE = [0, 10, 30, 60, 1440] as const;
export type RemindBefore = (typeof REMIND_BEFORE)[number];

export type AutoLock = 0 | 5 | 15 | 60;

export type HidePrivate = 30 | 60 | 300;

export const DEFAULT_SETTINGS: Settings = {
  language: DEFAULT_LANGUAGE,
  weekStart: 1,
  turnSpeed: 'normal',
  autoUpdate: true,
  syncMode: 'auto',
  hidePrivate: 60,
  hidePrivateAway: true,
  deskPrivate: 'lock',
  miniLocked: 'cover',
  autoLock: 0,
  lockAway: false,
  reminders: true,
  remindBefore: 0,
};

export const THEME_KEY = 'diaryo:theme';
export const SETTINGS_KEY = 'diaryo:settings';
const BOOK_KEY = 'diaryo:book';

export const systemDark = matchMedia('(prefers-color-scheme: dark)');

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
  if (saved.syncMode === 'manual' || saved.syncMode === 'password') {
    settings.syncMode = saved.syncMode;
  }
  if (saved.hidePrivate === 30 || saved.hidePrivate === 300) {
    settings.hidePrivate = saved.hidePrivate;
  }
  if (saved.hidePrivateAway === false) settings.hidePrivateAway = false;
  if (saved.deskPrivate === 'hide') settings.deskPrivate = 'hide';
  if (saved.miniLocked === 'hide') settings.miniLocked = 'hide';
  if (saved.autoLock === 5 || saved.autoLock === 15 || saved.autoLock === 60) {
    settings.autoLock = saved.autoLock;
  }
  if (saved.lockAway === true) settings.lockAway = true;
  if (saved.reminders === false) settings.reminders = false;
  if (REMIND_BEFORE.includes(saved.remindBefore as RemindBefore)) {
    settings.remindBefore = saved.remindBefore as RemindBefore;
  }
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

export interface LookSlice {
  /** Theme shown now (the system one already resolved). */
  theme: Theme;
  themePreference: ThemePreference;
  settings: Settings;
  bookStyle: BookStyle;
  toggleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setSettings: (patch: Partial<Settings>) => void;
  /** Reads the saved settings again (another window changed them). */
  reloadSettings: () => void;
  setBookStyle: (patch: Partial<BookStyle>) => void;
}

export const lookSlice: Slice<LookSlice> = (set, get) => ({
  theme: initialTheme,
  themePreference: initialPreference,
  settings: initialSettings,
  bookStyle: loadBookStyle(),
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
  setBookStyle: (patch) => {
    const bookStyle = { ...get().bookStyle, ...patch };
    writeJSON(BOOK_KEY, bookStyle);
    set({ bookStyle });
    get().diary?.refreshBook();
    // The cover's picture wears the covers too.
    void get().diary?.refreshCover();
  },
});
