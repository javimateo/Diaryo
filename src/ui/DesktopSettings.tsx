import { FolderOpen, FolderPen, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backupDesktop } from '../desktop/bridge';
import {
  chooseBackupDir,
  openBackupDir,
  setAutostart,
  setBackups,
  setDeskLayer,
  setDeskShortcut,
  setDesktopShortcut,
} from '../desktop/settings';
import { shortcutFromEvent, shortcutKeys } from '../desktop/shortcuts';
import { appVersion, isDesktop } from '../desktop/tauri';
import { useUI } from '../store/ui';
import { setDeskVisible } from '../cloud/lock';
import { useLock } from '../cloud/lockState';
import { Choice } from './Choice';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { formatTime } from '../i18n/dates';
import { useT } from './useT';

/** Settings → Desktop: the floating diary, the desk on the Windows desktop and its privacy. */
export function DesktopRows() {
  const t = useT();
  const desktop = useUI((s) => s.desktop);
  if (!desktop) return null;
  return (
    <>
      <SettingsRow
        label={t.desktop.floatingDiary}
        hint={desktop.shortcutOk ? t.desktop.floatingDiaryHint : t.desktop.shortcutTaken}
      >
        <ShortcutField
          shortcut={desktop.shortcut}
          ok={desktop.shortcutOk}
          onChange={(next) => void setDesktopShortcut(next)}
        />
      </SettingsRow>
      <SettingsRow
        label={t.desktop.deskLayer}
        hint={desktop.deskShortcutOk ? t.desktop.deskLayerHint : t.desktop.shortcutTaken}
      >
        <div className="settings-buttons">
          <ShortcutField
            shortcut={desktop.deskShortcut}
            ok={desktop.deskShortcutOk}
            onChange={(next) => void setDeskShortcut(next)}
          />
          <Switch
            checked={desktop.deskLayer}
            label={t.desktop.deskLayer}
            onChange={(enabled) => void setDeskLayer(enabled)}
          />
        </div>
      </SettingsRow>
      {desktop.deskLayer && <DeskPrivacy />}
    </>
  );
}

/** Settings → General, on Windows: starting with Windows and updating by itself. */
export function DesktopStartRows() {
  const t = useT();
  const desktop = useUI((s) => s.desktop);
  const autoUpdate = useUI((s) => s.settings.autoUpdate);
  const [version, setVersion] = useState('');
  useEffect(() => {
    if (isDesktop()) void appVersion().then(setVersion);
  }, []);
  if (!desktop) return null;
  return (
    <section className="settings-group">
      <h4>{t.settings.onWindows}</h4>
      <SettingsRow label={t.desktop.autostart} hint={t.desktop.autostartHint}>
        <Switch
          checked={desktop.autostart}
          label={t.desktop.autostart}
          onChange={(enabled) => void setAutostart(enabled)}
        />
      </SettingsRow>
      <SettingsRow label={t.desktop.autoUpdate} hint={t.desktop.autoUpdateHint(version)}>
        <Switch
          checked={autoUpdate}
          label={t.desktop.autoUpdate}
          onChange={(enabled) => useUI.getState().setSettings({ autoUpdate: enabled })}
        />
      </SettingsRow>
    </section>
  );
}

/** Settings → Backups and data, on Windows: a copy a day in a folder. */
export function DesktopBackups() {
  const t = useT();
  const desktop = useUI((s) => s.desktop);
  if (!desktop) return null;
  return (
    <section className="settings-group">
      <h4>{t.desktop.backups}</h4>
      <SettingsRow label={t.desktop.dailyBackup} hint={t.desktop.dailyBackupHint}>
        <Switch
          checked={desktop.backups}
          label={t.desktop.backups}
          onChange={(enabled) => void setBackups(enabled)}
        />
      </SettingsRow>
      <SettingsRow
        label={t.desktop.folder}
        hint={
          <span className="settings-path" title={desktop.backupDir}>
            {desktop.backupDir}
          </span>
        }
      >
        <div className="settings-buttons">
          <button type="button" className="settings-btn" onClick={() => void chooseBackupDir()}>
            <FolderPen size={15} strokeWidth={1.75} /> {t.desktop.change}
          </button>
          <button type="button" className="settings-btn" onClick={() => void openBackupDir()}>
            <FolderOpen size={15} strokeWidth={1.75} /> {t.desktop.open}
          </button>
        </div>
      </SettingsRow>
      {desktop.backups && (
        <SettingsRow
          label={t.desktop.backupNow}
          hint={
            desktop.lastBackup
              ? t.desktop.lastBackup(formatTime(desktop.lastBackup))
              : t.desktop.noBackupYet
          }
        >
          <button type="button" className="settings-btn" onClick={() => void backupDesktop()}>
            <Save size={15} strokeWidth={1.75} /> {t.desktop.copy}
          </button>
        </SettingsRow>
      )}
    </section>
  );
}

/** Shows the shortcut; when pressed, waits for the new combination (Esc to leave it as it was). */
function ShortcutField({
  shortcut,
  ok,
  onChange,
}: {
  shortcut: string;
  ok: boolean;
  onChange: (shortcut: string) => void;
}) {
  const t = useT();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      const next = shortcutFromEvent(e);
      if (!next) return;
      setRecording(false);
      onChange(next);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, onChange]);

  return (
    <button
      type="button"
      className="shortcut-field"
      data-recording={recording || undefined}
      data-error={!ok || undefined}
      aria-label={recording ? t.desktop.pressShortcutLabel : t.desktop.shortcutLabel(shortcut)}
      onClick={() => setRecording(!recording)}
    >
      {recording
        ? t.desktop.pressShortcut
        : shortcutKeys(shortcut, t.keys.space).map((key) => <kbd key={key}>{key}</kbd>)}
    </button>
  );
}

/**
 * What the Windows desktop shows of the diary: its private notes (with a padlock or not
 * at all) and, with the whole diary encrypted and locked, the desk and the mini diary.
 */
function DeskPrivacy() {
  const t = useT();
  const d = t.desktop;
  const level = useLock((s) => s.level);
  const deskSealed = useLock((s) => s.deskSealed);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  if (level === 'off') return null;
  return (
    <>
      <SettingsRow label={d.deskPrivate} hint={d.deskPrivateHint}>
        <Choice
          options={(['lock', 'hide'] as const).map((id) => [id, d.deskPrivateOptions[id]])}
          value={settings.deskPrivate}
          onChange={(deskPrivate) => setSettings({ deskPrivate })}
        />
      </SettingsRow>
      {level === 'all' && (
        <>
          <SettingsRow label={d.deskLocked} hint={d.deskLockedHint}>
            <Choice
              options={(['clear', 'sealed'] as const).map((id) => [id, d.deskLockedOptions[id]])}
              value={deskSealed ? 'sealed' : 'clear'}
              onChange={(next) => void setDeskVisible(next === 'clear')}
            />
          </SettingsRow>
          <SettingsRow label={d.miniLocked}>
            <Choice
              options={(['cover', 'hide'] as const).map((id) => [id, d.miniLockedOptions[id]])}
              value={settings.miniLocked}
              onChange={(miniLocked) => setSettings({ miniLocked })}
            />
          </SettingsRow>
        </>
      )}
    </>
  );
}
