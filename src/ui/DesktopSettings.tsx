import { FolderOpen, FolderPen, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  backupDesktop,
  chooseBackupDir,
  openBackupDir,
  setAutostart,
  setBackups,
  setDeskLayer,
  setDeskShortcut,
  setDesktopShortcut,
  shortcutFromEvent,
  shortcutKeys,
} from '../desktop/desktop';
import { useUI } from '../store/ui';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Ajustes de la app de escritorio: diario flotante, arranque con Windows y copias. */
export function DesktopSettings() {
  const desktop = useUI((s) => s.desktop);
  if (!desktop) return null;

  return (
    <>
      <section className="settings-section">
        <h3>Escritorio</h3>
        <SettingsRow
          label="Diario flotante"
          hint={
            desktop.shortcutOk
              ? 'Aparece sobre el escritorio desde cualquier sitio. Esc lo esconde.'
              : 'Otra app ya usa este atajo: elige otro.'
          }
        >
          <ShortcutField
            shortcut={desktop.shortcut}
            ok={desktop.shortcutOk}
            onChange={(next) => void setDesktopShortcut(next)}
          />
        </SettingsRow>
        <SettingsRow
          label="Mesa en el escritorio"
          hint={
            desktop.deskShortcutOk
              ? 'Lo que hay en la mesa, sobre el fondo del escritorio. El atajo la enseña o la esconde.'
              : 'Otra app ya usa este atajo: elige otro.'
          }
        >
          <div className="settings-buttons">
            <ShortcutField
              shortcut={desktop.deskShortcut}
              ok={desktop.deskShortcutOk}
              onChange={(next) => void setDeskShortcut(next)}
            />
            <Switch
              checked={desktop.deskLayer}
              label="Mesa en el escritorio"
              onChange={(enabled) => void setDeskLayer(enabled)}
            />
          </div>
        </SettingsRow>
        <SettingsRow label="Arrancar con Windows" hint="Escondido, listo para el atajo.">
          <Switch
            checked={desktop.autostart}
            label="Arrancar con Windows"
            onChange={(enabled) => void setAutostart(enabled)}
          />
        </SettingsRow>
      </section>

      <section className="settings-section">
        <h3>Copias automáticas</h3>
        <SettingsRow
          label="Una copia cada día"
          hint="Al esconder o cerrar diaryo, y cada media hora si hay cambios. Se guardan las de las dos últimas semanas."
        >
          <Switch
            checked={desktop.backups}
            label="Copias automáticas"
            onChange={(enabled) => void setBackups(enabled)}
          />
        </SettingsRow>
        <SettingsRow
          label="Carpeta"
          hint={
            <span className="settings-path" title={desktop.backupDir}>
              {desktop.backupDir}
            </span>
          }
        >
          <div className="settings-buttons">
            <button type="button" className="settings-btn" onClick={() => void chooseBackupDir()}>
              <FolderPen size={15} strokeWidth={1.75} /> Cambiar
            </button>
            <button type="button" className="settings-btn" onClick={() => void openBackupDir()}>
              <FolderOpen size={15} strokeWidth={1.75} /> Abrir
            </button>
          </div>
        </SettingsRow>
        {desktop.backups && (
          <SettingsRow
            label="Copiar ahora"
            hint={
              desktop.lastBackup
                ? `Última copia: hoy a las ${time.format(desktop.lastBackup)}.`
                : 'Aún no se ha copiado en esta sesión.'
            }
          >
            <button type="button" className="settings-btn" onClick={() => void backupDesktop()}>
              <Save size={15} strokeWidth={1.75} /> Copiar
            </button>
          </SettingsRow>
        )}
      </section>
    </>
  );
}

/** Muestra el atajo; al pulsarlo, espera la combinación nueva (Esc para dejarlo como estaba). */
function ShortcutField({
  shortcut,
  ok,
  onChange,
}: {
  shortcut: string;
  ok: boolean;
  onChange: (shortcut: string) => void;
}) {
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
      aria-label={recording ? 'Pulsa el atajo nuevo' : `Atajo: ${shortcut}. Pulsa para cambiarlo`}
      onClick={() => setRecording(!recording)}
    >
      {recording
        ? 'Pulsa el atajo…'
        : shortcutKeys(shortcut).map((key) => <kbd key={key}>{key}</kbd>)}
    </button>
  );
}
