import { useUI } from '../store/ui';
import { call } from './tauri';

/** In its window or floating over the desktop (the widget). */
export type DesktopMode = 'window' | 'widget';

/** What the desktop side tells. */
export interface DesktopInfo {
  mode: DesktopMode;
  /** Global shortcut of the floating diary ("Ctrl+Alt+D"). */
  shortcut: string;
  /** The shortcut works (otherwise, another app has taken it). */
  shortcutOk: boolean;
  autostart: boolean;
  backups: boolean;
  backupDir: string;
  /** The desk on the Windows desktop. */
  deskLayer: boolean;
  /** Shortcut that shows or hides it ("Ctrl+Alt+N"). */
  deskShortcut: string;
  deskShortcutOk: boolean;
  /** When the last backup was made in this session. */
  lastBackup?: number;
}

/** Desktop settings return how they end up (or the reason if it failed). */
async function updateInfo(command: string, args?: Record<string, unknown>) {
  const { setDesktop, showToast } = useUI.getState();
  try {
    setDesktop(await call<DesktopInfo>(command, args));
  } catch (error) {
    showToast(String(error));
  }
}

export const setDesktopShortcut = (shortcut: string) => updateInfo('set_shortcut', { shortcut });
export const setAutostart = (enabled: boolean) => updateInfo('set_autostart', { enabled });
export const setBackups = (enabled: boolean) => updateInfo('set_backups', { enabled });
export const setDeskLayer = (enabled: boolean) => updateInfo('set_desk_layer', { enabled });
export const setDeskShortcut = (shortcut: string) => updateInfo('set_desk_shortcut', { shortcut });
export const chooseBackupDir = () => updateInfo('choose_backup_dir');
export const openBackupDir = () =>
  call('open_backup_dir').catch((error) => useUI.getState().showToast(String(error)));
