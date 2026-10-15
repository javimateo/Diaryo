import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/testBrowser';

// What is saved in the browser, readable by the tests (and set before the store loads).
const saved = vi.hoisted(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as unknown as Storage;
  data.set('diaryo:settings', JSON.stringify({ language: 'en', weekStart: 7, autoLock: 15 }));
  data.set('diaryo:diary-tab', 'tasks');
  return data;
});

import type { DesktopInfo } from '../desktop/settings';
import type { Diary } from '../diary/diary';
import { DEFAULT_BOOK_STYLE } from '../engine/book';
import type { Engine } from '../engine/engine';
import { getLanguage } from '../i18n';
import { DEFAULT_SETTINGS, SETTINGS_KEY, THEME_KEY, useUI } from './ui';

const initial = useUI.getState();
const read = (key: string) => JSON.parse(saved.get(key) ?? 'null');

beforeEach(() => {
  useUI.setState(initial, true);
});
afterEach(() => vi.useRealTimers());

describe('the interface state, what it keeps', () => {
  it('starts from what was saved, valid values only', () => {
    expect(initial.settings).toEqual({ ...DEFAULT_SETTINGS, language: 'en', autoLock: 15 });
    expect(initial.diaryTab).toBe('tasks');
    expect(getLanguage()).toBe('en');
  });

  it('saves the settings and switches the language', () => {
    useUI.getState().setSettings({ language: 'es', weekStart: 0 });
    expect(read(SETTINGS_KEY)).toMatchObject({ language: 'es', weekStart: 0, autoLock: 15 });
    expect(getLanguage()).toBe('es');
    saved.set(SETTINGS_KEY, JSON.stringify({ language: 'en' }));
    useUI.getState().reloadSettings();
    expect(useUI.getState().settings.language).toBe('en');
    expect(getLanguage()).toBe('en');
  });

  it('saves the theme, resolving the system one', () => {
    useUI.getState().setThemePreference('dark');
    expect(saved.get(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    useUI.getState().toggleTheme();
    expect(useUI.getState().theme).toBe('light');
    useUI.getState().setThemePreference('system');
    expect(useUI.getState().theme).toBe('light'); // The test's system is light.
  });

  it("saves the tools' styles and the recent colors (lower case, no repeats)", () => {
    useUI.getState().setToolStyle('pen', { size: 9 });
    expect(read('diaryo:styles').pen.size).toBe(9);
    const { addRecentColor } = useUI.getState();
    addRecentColor('#AA0000');
    addRecentColor('#00bb00');
    addRecentColor('#aa0000');
    expect(useUI.getState().recentColors.slice(0, 2)).toEqual(['#aa0000', '#00bb00']);
    expect(read('diaryo:recent-colors').slice(0, 2)).toEqual(['#aa0000', '#00bb00']);
  });

  it("saves the diary's look and tells the diary", () => {
    const diary = { refreshBook: vi.fn(), refreshCover: vi.fn(), refreshThumbnail: vi.fn() };
    useUI.setState({ diary: diary as unknown as Diary });
    useUI.getState().setBookStyle({ desk: 'marble' });
    expect(useUI.getState().bookStyle).toEqual({ ...DEFAULT_BOOK_STYLE, desk: 'marble' });
    expect(read('diaryo:book').desk).toBe('marble');
    expect(diary.refreshBook).toHaveBeenCalled();
    expect(diary.refreshCover).toHaveBeenCalled();
  });

  it("saves the index's tab", () => {
    useUI.getState().setDiaryTab('pages');
    expect(saved.get('diaryo:diary-tab')).toBe('pages');
  });
});

describe('the interface state, what goes together', () => {
  it('the settings open on a page (or the last one), closing the context menu', () => {
    useUI.setState({ contextMenu: { x: 0, y: 0 } as never });
    useUI.getState().setSettingsOpen(true, 'privacy');
    expect(useUI.getState()).toMatchObject({
      settingsOpen: true,
      settingsSection: 'privacy',
      settingsDirect: true,
      contextMenu: null,
    });
    useUI.getState().setSettingsOpen(false);
    useUI.getState().setSettingsOpen(true);
    expect(useUI.getState()).toMatchObject({ settingsSection: 'privacy', settingsDirect: false });
  });

  it('a dialog opened from the settings hides them, and they come back when it closes', () => {
    for (const open of ['setAccountDialog', 'setVaultDialog', 'setLockDialog'] as const) {
      useUI.getState().setSettingsOpen(true);
      useUI.getState()[open]({ view: 'change', fromSettings: true } as never);
      expect(useUI.getState().settingsOpen).toBe(false);
      useUI.getState()[open](null);
      expect(useUI.getState().settingsOpen).toBe(true);
      useUI.getState().setSettingsOpen(false);
      useUI.getState()[open]({ view: 'change' } as never);
      useUI.getState()[open](null);
      expect(useUI.getState().settingsOpen).toBe(false);
    }
  });

  it('the help keeps its tab unless given one', () => {
    useUI.getState().setHelpOpen(true, 'shortcuts');
    useUI.getState().setHelpOpen(false);
    useUI.getState().setHelpOpen(true);
    expect(useUI.getState().helpTab).toBe('shortcuts');
  });

  it('the map flies from the book, closes the index, and brings the thumbnail up to date', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const diary = { refreshThumbnail: vi.fn() };
    const engine = { bookScreenRect: () => rect };
    useUI.setState({
      diary: diary as unknown as Diary,
      engine: engine as unknown as Engine,
      diaryOpen: true,
    });
    useUI.getState().setMapOpen(true);
    expect(useUI.getState()).toMatchObject({ mapOpen: true, mapOrigin: rect, diaryOpen: false });
    expect(diary.refreshThumbnail).toHaveBeenCalledTimes(1);
    useUI.getState().setMapOpen(true);
    expect(diary.refreshThumbnail).toHaveBeenCalledTimes(1);
    useUI.getState().setMapOpen(false);
    expect(useUI.getState().mapOrigin).toBeNull();
  });

  it('the index and "Próximo" share their side: one at a time', () => {
    const diary = { refreshThumbnail: vi.fn() };
    useUI.setState({ diary: diary as unknown as Diary });
    useUI.getState().setUpcomingOpen(true);
    useUI.getState().setDiaryOpen(true);
    expect(useUI.getState()).toMatchObject({ diaryOpen: true, upcomingOpen: false });
    expect(diary.refreshThumbnail).toHaveBeenCalled();
    useUI.getState().setUpcomingOpen(true);
    expect(useUI.getState()).toMatchObject({ diaryOpen: false, upcomingOpen: true });
  });

  it('the palette closes the context menu', () => {
    useUI.setState({ contextMenu: { x: 0, y: 0 } as never });
    useUI.getState().setPaletteOpen(true);
    expect(useUI.getState().contextMenu).toBeNull();
  });

  it("the desktop's state changes in parts", () => {
    useUI.getState().setDesktop({ mode: 'window', backups: true } as DesktopInfo);
    useUI.getState().setDesktop({ backups: false });
    expect(useUI.getState().desktop).toEqual({ mode: 'window', backups: false });
  });

  it('a notice hides by itself, later if it has a button', () => {
    vi.useFakeTimers();
    useUI.getState().showToast('hola');
    vi.advanceTimersByTime(1900);
    expect(useUI.getState().toast?.visible).toBe(false);
    useUI.getState().showToast('hola', { label: 'Deshacer', run: () => {} });
    vi.advanceTimersByTime(1900);
    expect(useUI.getState().toast?.visible).toBe(true);
    vi.advanceTimersByTime(4200);
    expect(useUI.getState().toast?.visible).toBe(false);
  });
});
