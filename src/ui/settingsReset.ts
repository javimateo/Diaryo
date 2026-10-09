import { DEFAULT_BOOK_STYLE } from '../engine/book';
import { setDeskVisible } from '../cloud/lock';
import { useLock } from '../cloud/lockState';
import {
  setAutostart,
  setBackups,
  setDeskLayer,
  setDeskShortcut,
  setDesktopShortcut,
} from '../desktop/settings';
import { DEFAULT_SETTINGS, useUI, type SettingsSection } from '../store/ui';
import { t } from '../i18n';

/** The default shortcuts of the desktop app (src-tauri/src/settings.rs). */
const DEFAULT_SHORTCUT = 'Ctrl+Alt+D';
const DEFAULT_DESK_SHORTCUT = 'Ctrl+Alt+N';

type Reset = () => () => void;

/**
 * What "Restore" puts back on each settings page; each one returns how to undo it. Pages
 * without a choice to restore are left out. The encryption level is never touched: it
 * needs the password and changes the stored diary.
 */
const RESETS: Partial<Record<SettingsSection, Reset>> = {
  general: () => {
    const { settings, themePreference, desktop, setSettings, setThemePreference } =
      useUI.getState();
    const { language, weekStart, turnSpeed, autoUpdate } = settings;
    const autostart = desktop?.autostart;
    const d = DEFAULT_SETTINGS;
    setSettings({
      language: d.language,
      weekStart: d.weekStart,
      turnSpeed: d.turnSpeed,
      autoUpdate: d.autoUpdate,
    });
    setThemePreference('system');
    // Starting with Windows is on the first time the app runs.
    if (autostart === false) void setAutostart(true);
    return () => {
      setSettings({ language, weekStart, turnSpeed, autoUpdate });
      setThemePreference(themePreference);
      if (autostart === false) void setAutostart(false);
    };
  },
  look: () => {
    const { bookStyle, themePreference, setBookStyle, setThemePreference } = useUI.getState();
    setBookStyle(DEFAULT_BOOK_STYLE);
    setThemePreference('system');
    return () => {
      setBookStyle(bookStyle);
      setThemePreference(themePreference);
    };
  },
  desktop: () => {
    const { settings, desktop, setSettings } = useUI.getState();
    const { deskPrivate, miniLocked } = settings;
    const sealed = useLock.getState().deskSealed;
    if (desktop) {
      if (desktop.shortcut !== DEFAULT_SHORTCUT) void setDesktopShortcut(DEFAULT_SHORTCUT);
      if (desktop.deskShortcut !== DEFAULT_DESK_SHORTCUT) {
        void setDeskShortcut(DEFAULT_DESK_SHORTCUT);
      }
      if (!desktop.deskLayer) void setDeskLayer(true);
    }
    setSettings({
      deskPrivate: DEFAULT_SETTINGS.deskPrivate,
      miniLocked: DEFAULT_SETTINGS.miniLocked,
    });
    if (sealed) void setDeskVisible(true);
    return () => {
      if (desktop) {
        void setDesktopShortcut(desktop.shortcut);
        void setDeskShortcut(desktop.deskShortcut);
        void setDeskLayer(desktop.deskLayer);
      }
      setSettings({ deskPrivate, miniLocked });
      if (sealed) void setDeskVisible(false);
    };
  },
  privacy: () => {
    const { settings, setSettings } = useUI.getState();
    const { hidePrivate, hidePrivateAway, autoLock, lockAway } = settings;
    const d = DEFAULT_SETTINGS;
    setSettings({
      hidePrivate: d.hidePrivate,
      hidePrivateAway: d.hidePrivateAway,
      autoLock: d.autoLock,
      lockAway: d.lockAway,
    });
    return () => setSettings({ hidePrivate, hidePrivateAway, autoLock, lockAway });
  },
  data: () => {
    const backups = useUI.getState().desktop?.backups;
    if (backups === false) void setBackups(true);
    return () => {
      if (backups === false) void setBackups(false);
    };
  },
};

/**
 * Whether a settings page has something to restore here: backups only on Windows, and
 * locking and private notes only with something encrypted.
 */
export function canReset(section: SettingsSection) {
  if (section === 'data') return useUI.getState().desktop !== null;
  if (section === 'privacy') return useLock.getState().level !== 'off';
  return section in RESETS;
}

/** Restores a page's settings, with a notice to undo it. */
export function resetSection(section: SettingsSection) {
  const reset = RESETS[section];
  if (!reset) return;
  const undo = reset();
  const texts = t().settings;
  useUI.getState().showToast(texts.restored, { label: texts.undo, run: undo });
}
