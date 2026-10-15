import { beforeEach, describe, expect, it, vi } from 'vitest';
import './testBrowser';

vi.mock('../desktop/settings', () => ({
  setAutostart: vi.fn(),
  setBackups: vi.fn(),
  setDeskLayer: vi.fn(),
  setDeskShortcut: vi.fn(),
  setDesktopShortcut: vi.fn(),
}));
vi.mock('../cloud/lock', () => ({ setDeskVisible: vi.fn() }));

import { setDeskVisible } from '../cloud/lock';
import { useLock } from '../cloud/lockState';
import {
  setAutostart,
  setBackups,
  setDeskLayer,
  setDeskShortcut,
  setDesktopShortcut,
} from '../desktop/settings';
import type { DesktopInfo } from '../desktop/settings';
import { DEFAULT_BOOK_STYLE } from '../engine/book';
import { DEFAULT_SETTINGS, useUI, type Settings, type ToastAction } from '../store/ui';
import { canReset, resetSection } from './settingsReset';

/** The settings of every page changed from their defaults. */
const changed: Settings = {
  ...DEFAULT_SETTINGS,
  language: 'en',
  weekStart: 0,
  turnSpeed: 'fast',
  autoUpdate: false,
  syncMode: 'manual',
  hidePrivate: 300,
  hidePrivateAway: false,
  deskPrivate: 'hide',
  miniLocked: 'hide',
  autoLock: 15,
  lockAway: true,
  reminders: false,
  remindBefore: 30,
};

const desktop = (more: Partial<DesktopInfo> = {}) =>
  ({
    mode: 'window',
    shortcut: 'Ctrl+Shift+J',
    shortcutOk: true,
    autostart: false,
    backups: false,
    backupDir: 'C:\\copias',
    deskLayer: false,
    deskShortcut: 'Ctrl+Shift+K',
    deskShortcutOk: true,
    ...more,
  }) as DesktopInfo;

const toast = () => vi.fn<(message: string, action?: ToastAction) => void>();
let showToast: ReturnType<typeof toast>;
/** Restores a page and returns how to undo it (the notice's button). */
const reset = (section: Parameters<typeof resetSection>[0]) => {
  resetSection(section);
  const [, action] = showToast.mock.calls.at(-1)!;
  return action!.run;
};

beforeEach(() => {
  vi.clearAllMocks();
  showToast = toast();
  useUI.setState({ settings: { ...changed }, showToast, desktop: null });
  useUI.getState().setThemePreference('dark');
  useUI.getState().setBookStyle({ ...DEFAULT_BOOK_STYLE, cover: '#2f2d2a', desk: 'marble' });
  useLock.setState({ level: 'all', deskSealed: false });
});

describe('restoring a settings page', () => {
  it('general: its own settings and the theme, and undo leaves them as they were', () => {
    useUI.setState({ desktop: desktop() });
    const undo = reset('general');
    const { settings, themePreference } = useUI.getState();
    expect(settings).toEqual({
      ...changed,
      language: DEFAULT_SETTINGS.language,
      weekStart: DEFAULT_SETTINGS.weekStart,
      turnSpeed: DEFAULT_SETTINGS.turnSpeed,
      autoUpdate: DEFAULT_SETTINGS.autoUpdate,
    });
    expect(themePreference).toBe('system');
    expect(setAutostart).toHaveBeenCalledWith(true);
    undo();
    expect(useUI.getState().settings).toEqual(changed);
    expect(useUI.getState().themePreference).toBe('dark');
    expect(setAutostart).toHaveBeenLastCalledWith(false);
  });

  it("look: the diary's look and the theme, nothing else", () => {
    const undo = reset('look');
    expect(useUI.getState().bookStyle).toEqual(DEFAULT_BOOK_STYLE);
    expect(useUI.getState().themePreference).toBe('system');
    expect(useUI.getState().settings).toEqual(changed);
    undo();
    expect(useUI.getState().bookStyle.desk).toBe('marble');
    expect(useUI.getState().themePreference).toBe('dark');
  });

  it("desktop: the shortcuts, the desk and the desktop's settings", () => {
    useUI.setState({ desktop: desktop() });
    useLock.setState({ deskSealed: true });
    const undo = reset('desktop');
    expect(setDesktopShortcut).toHaveBeenCalledWith('Ctrl+Alt+D');
    expect(setDeskShortcut).toHaveBeenCalledWith('Ctrl+Alt+N');
    expect(setDeskLayer).toHaveBeenCalledWith(true);
    expect(setDeskVisible).toHaveBeenCalledWith(true);
    const { settings } = useUI.getState();
    expect(settings).toEqual({
      ...changed,
      deskPrivate: DEFAULT_SETTINGS.deskPrivate,
      miniLocked: DEFAULT_SETTINGS.miniLocked,
      reminders: DEFAULT_SETTINGS.reminders,
      remindBefore: DEFAULT_SETTINGS.remindBefore,
    });
    undo();
    expect(setDesktopShortcut).toHaveBeenLastCalledWith('Ctrl+Shift+J');
    expect(setDeskShortcut).toHaveBeenLastCalledWith('Ctrl+Shift+K');
    expect(setDeskLayer).toHaveBeenLastCalledWith(false);
    expect(setDeskVisible).toHaveBeenLastCalledWith(false);
    expect(useUI.getState().settings).toEqual(changed);
  });

  it('privacy: hiding the private notes and locking by itself', () => {
    const undo = reset('privacy');
    expect(useUI.getState().settings).toEqual({
      ...changed,
      hidePrivate: DEFAULT_SETTINGS.hidePrivate,
      hidePrivateAway: DEFAULT_SETTINGS.hidePrivateAway,
      autoLock: DEFAULT_SETTINGS.autoLock,
      lockAway: DEFAULT_SETTINGS.lockAway,
    });
    undo();
    expect(useUI.getState().settings).toEqual(changed);
  });

  it('data: the daily backups back on', () => {
    useUI.setState({ desktop: desktop() });
    const undo = reset('data');
    expect(setBackups).toHaveBeenCalledWith(true);
    undo();
    expect(setBackups).toHaveBeenLastCalledWith(false);
  });

  it('never changes what is encrypted, nor how the cloud syncs', () => {
    useUI.setState({ desktop: desktop() });
    for (const section of ['general', 'look', 'desktop', 'privacy', 'data'] as const) {
      reset(section);
    }
    expect(useLock.getState().level).toBe('all');
    expect(useUI.getState().settings.syncMode).toBe('manual');
  });
});

describe('which pages can be restored', () => {
  it('the backups only in the desktop app, privacy only with something encrypted', () => {
    expect(canReset('data')).toBe(false);
    useUI.setState({ desktop: desktop() });
    expect(canReset('data')).toBe(true);
    expect(canReset('privacy')).toBe(true);
    useLock.setState({ level: 'off' });
    expect(canReset('privacy')).toBe(false);
    expect(canReset('general')).toBe(true);
    expect(canReset('account')).toBe(false);
    expect(canReset('help')).toBe(false);
  });
});
