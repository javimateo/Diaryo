import { Check, Download, Keyboard, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TurnSpeed } from '../diary/diary';
import { saveCopy } from './fileActions';
import { useUI, type ThemePreference } from '../store/ui';
import { isDesktop } from '../desktop/tauri';
import { BookStyleSection } from './BookStyleSection';
import { DesktopSettings } from './DesktopSettings';
import { Choice } from './Choice';
import { SettingsRow } from './SettingsRow';
import { useT } from './useT';
import { LANGUAGES, type Language } from '../i18n';
import { AccountSection } from './AccountSection';
import { formatBytes } from './formatBytes';

const THEMES: ThemePreference[] = ['light', 'dark', 'system'];
const TURN_SPEEDS: TurnSpeed[] = ['normal', 'fast', 'off'];

/** Settings: account, appearance, diary look, behaviour and storage. */
export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  if (!open) return null;
  return <Settings />;
}

function Settings() {
  const t = useT();
  const setOpen = useUI((s) => s.setSettingsOpen);
  const themePreference = useUI((s) => s.themePreference);
  const setThemePreference = useUI((s) => s.setThemePreference);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const close = () => setOpen(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // While recording a shortcut, Esc only cancels that.
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
          <h2 id="settings-title">{t.settings.title}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="settings-body" data-scrollable>
          <AccountSection />

          <section className="settings-section">
            <h3>{t.settings.appearance}</h3>
            <SettingsRow label={t.settings.language}>
              <Choice
                options={Object.entries(LANGUAGES) as [Language, string][]}
                value={settings.language}
                onChange={(language) => setSettings({ language })}
              />
            </SettingsRow>
            <SettingsRow label={t.settings.theme}>
              <Choice
                options={THEMES.map((id) => [id, t.settings.themes[id]])}
                value={themePreference}
                onChange={(value) => setThemePreference(value)}
              />
            </SettingsRow>
          </section>

          <section className="settings-section">
            <h3>{t.settings.bookLook}</h3>
            <BookStyleSection />
          </section>

          <section className="settings-section">
            <h3>{t.settings.diary}</h3>
            <SettingsRow label={t.settings.weekStart}>
              <Choice
                options={[
                  [1, t.settings.monday],
                  [0, t.settings.sunday],
                ]}
                value={settings.weekStart}
                onChange={(weekStart) => setSettings({ weekStart })}
              />
            </SettingsRow>
            <SettingsRow label={t.settings.turnPage} hint={t.settings.turnPageHint}>
              <Choice
                options={TURN_SPEEDS.map((id) => [id, t.settings.turnSpeeds[id]])}
                value={settings.turnSpeed}
                onChange={(turnSpeed) => setSettings({ turnSpeed })}
              />
            </SettingsRow>
          </section>

          <DesktopSettings />

          <Storage />

          <section className="settings-section">
            <h3>{t.settings.help}</h3>
            <SettingsRow label={t.settings.shortcuts} hint={t.settings.shortcutsHint}>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setOpen(false);
                  useUI.getState().setHelpOpen(true);
                }}
              >
                <Keyboard size={15} strokeWidth={1.75} /> {t.settings.showShortcuts}
              </button>
            </SettingsRow>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Where and how much is saved, and how to protect it. */
function Storage() {
  const t = useT();
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
    showToast(ok ? t.settings.keepDone : t.settings.keepFailed);
  };

  return (
    <section className="settings-section">
      <h3>{t.settings.storage}</h3>
      <p className="settings-note">
        {t.settings.savedWhere(desktop, usage === null ? null : formatBytes(usage))}
      </p>
      {!desktop && (
        <SettingsRow label={t.settings.keepData} hint={t.settings.keepDataHint}>
          {persisted ? (
            <span className="settings-ok">
              <Check size={15} strokeWidth={2} /> {t.settings.kept}
            </span>
          ) : (
            <button type="button" className="settings-btn" onClick={() => void protect()}>
              <ShieldCheck size={15} strokeWidth={1.75} /> {t.settings.keep}
            </button>
          )}
        </SettingsRow>
      )}
      <SettingsRow label={t.settings.backup} hint={t.settings.backupHint}>
        <button
          type="button"
          className="settings-btn"
          disabled={!diary}
          onClick={() => diary && void saveCopy(diary)}
        >
          <Download size={15} strokeWidth={1.75} /> {t.settings.saveCopy}
        </button>
      </SettingsRow>
    </section>
  );
}
