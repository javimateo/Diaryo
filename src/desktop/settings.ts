import { useUI } from '../store/ui';
import { call } from './tauri';

/** En su ventana o flotando sobre el escritorio (el widget). */
export type DesktopMode = 'window' | 'widget';

/** Lo que cuenta la parte de escritorio. */
export interface DesktopInfo {
  mode: DesktopMode;
  /** Atajo global del diario flotante ("Ctrl+Alt+D"). */
  shortcut: string;
  /** El atajo funciona (si no, otra app lo tiene cogido). */
  shortcutOk: boolean;
  autostart: boolean;
  backups: boolean;
  backupDir: string;
  /** La mesa en el escritorio de Windows. */
  deskLayer: boolean;
  /** Atajo que la enseña o la esconde ("Ctrl+Alt+N"). */
  deskShortcut: string;
  deskShortcutOk: boolean;
  /** Cuándo se hizo la última copia en esta sesión. */
  lastBackup?: number;
}

/** Los ajustes de escritorio devuelven cómo quedan (o el motivo si no se pudo). */
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
