import { Check, Download, Keyboard, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TurnSpeed } from '../diary/diary';
import { saveCopy } from './fileActions';
import { useUI, type ThemePreference } from '../store/ui';
import { isDesktop } from '../desktop/desktop';
import { BookStyleSection } from './BookStyleSection';
import { DesktopSettings } from './DesktopSettings';
import { SettingsRow } from './SettingsRow';

const THEMES: [ThemePreference, string][] = [
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
  ['system', 'Como el sistema'],
];

const TURN_SPEEDS: [TurnSpeed, string][] = [
  ['normal', 'Con animación'],
  ['fast', 'Rápido'],
  ['off', 'Sin animación'],
];

const WEEK_STARTS: [0 | 1, string][] = [
  [1, 'Lunes'],
  [0, 'Domingo'],
];

const bytes = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${bytes.format(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${bytes.format(value / 1024 ** 2)} MB`;
  return `${bytes.format(value / 1024 ** 3)} GB`;
}

/** Ajustes: apariencia, aspecto del diario, cómo se comporta y el guardado. */
export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  if (!open) return null;
  return <Settings />;
}

function Settings() {
  const setOpen = useUI((s) => s.setSettingsOpen);
  const themePreference = useUI((s) => s.themePreference);
  const setThemePreference = useUI((s) => s.setThemePreference);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const close = () => setOpen(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Mientras se graba un atajo, Esc solo cancela eso.
      if (document.querySelector('.shortcut-field[data-recording]')) return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setOpen]);

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <header className="dialog-header">
          <h2 id="settings-title">Ajustes</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="settings-body" data-scrollable>
          <section className="settings-section">
            <h3>Apariencia</h3>
            <SettingsRow label="Tema">
              <Choice
                options={THEMES}
                value={themePreference}
                onChange={(value) => setThemePreference(value)}
              />
            </SettingsRow>
          </section>

          <section className="settings-section">
            <h3>Aspecto del diario</h3>
            <BookStyleSection />
          </section>

          <section className="settings-section">
            <h3>Diario</h3>
            <SettingsRow label="La semana empieza en">
              <Choice
                options={WEEK_STARTS}
                value={settings.weekStart}
                onChange={(weekStart) => setSettings({ weekStart })}
              />
            </SettingsRow>
            <SettingsRow
              label="Pasar página"
              hint="Con los botones, el teclado o al ir a otro día."
            >
              <Choice
                options={TURN_SPEEDS}
                value={settings.turnSpeed}
                onChange={(turnSpeed) => setSettings({ turnSpeed })}
              />
            </SettingsRow>
          </section>

          <DesktopSettings />

          <Storage />

          <section className="settings-section">
            <h3>Ayuda</h3>
            <SettingsRow label="Atajos de teclado" hint="También con ? en cualquier momento.">
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setOpen(false);
                  useUI.getState().setHelpOpen(true);
                }}
              >
                <Keyboard size={15} strokeWidth={1.75} /> Ver atajos
              </button>
            </SettingsRow>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Dónde y cuánto se guarda, y cómo protegerlo. */
function Storage() {
  const diary = useUI((s) => s.diary);
  const desktop = isDesktop();
  const showToast = useUI((s) => s.showToast);
  const [usage, setUsage] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void navigator.storage?.estimate?.().then((e) => alive && setUsage(e.usage ?? null));
    void navigator.storage?.persisted?.().then((value) => alive && setPersisted(value));
    return () => {
      alive = false;
    };
  }, []);

  const protect = async () => {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    setPersisted(ok);
    showToast(
      ok
        ? 'Protegido: el navegador no lo borrará'
        : 'El navegador no lo ha permitido · guarda una copia de vez en cuando',
    );
  };

  return (
    <section className="settings-section">
      <h3>Guardado</h3>
      <p className="settings-note">
        Todo se guarda solo {desktop ? 'en esta app' : 'en este navegador'}
        {usage !== null && <> y ahora ocupa {formatBytes(usage)}</>}.
      </p>
      {!desktop && (
        <SettingsRow
          label="Que el navegador no lo borre"
          hint="Si le falta espacio, el navegador puede borrar datos de las webs."
        >
          {persisted ? (
            <span className="settings-ok">
              <Check size={15} strokeWidth={2} /> Protegido
            </span>
          ) : (
            <button type="button" className="settings-btn" onClick={() => void protect()}>
              <ShieldCheck size={15} strokeWidth={1.75} /> Proteger
            </button>
          )}
        </SettingsRow>
      )}
      <SettingsRow
        label="Copia de seguridad"
        hint="Un archivo con todo el diario, para guardarlo aparte."
      >
        <button
          type="button"
          className="settings-btn"
          disabled={!diary}
          onClick={() => diary && void saveCopy(diary)}
        >
          <Download size={15} strokeWidth={1.75} /> Guardar una copia
        </button>
      </SettingsRow>
    </section>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-group" role="group">
      {options.map(([id, label]) => (
        <button
          key={String(id)}
          type="button"
          className="icon-btn text-option"
          data-active={value === id || undefined}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
