import {
  Archive,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Download,
  FolderOpen,
  Keyboard,
  Lock,
  Monitor,
  ShieldCheck,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TurnSpeed } from '../diary/diary';
import { pickCopy, saveCopy } from './fileActions';
import { SETTINGS_SECTIONS, useUI, type SettingsSection, type ThemePreference } from '../store/ui';
import { isDesktop } from '../desktop/tauri';
import { BookStyleSection } from './BookStyleSection';
import { DesktopBackups, DesktopRows, DesktopStartRows } from './DesktopSettings';
import { Choice } from './Choice';
import { SettingsRow } from './SettingsRow';
import { useT } from './useT';
import { LANGUAGES, type Language } from '../i18n';
import { AccountSection } from './AccountSection';
import { PrivacySection } from './PrivacySection';
import { LegalLinks, WebsiteLink } from './LegalLinks';
import { formatBytes } from './formatBytes';

const THEMES: ThemePreference[] = ['light', 'dark', 'system'];
const TURN_SPEEDS: TurnSpeed[] = ['normal', 'fast', 'off'];

const ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontal,
  look: BookOpen,
  desktop: Monitor,
  privacy: Lock,
  account: Cloud,
  data: Archive,
  help: CircleHelp,
};

/** Settings: a page per section, chosen on the left (on a phone, a list first). */
export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  if (!open) return null;
  return <Settings />;
}

function Settings() {
  const t = useT();
  const setOpen = useUI((s) => s.setSettingsOpen);
  const section = useUI((s) => s.settingsSection);
  const setSection = useUI((s) => s.setSettingsSection);
  const desktop = useUI((s) => s.desktop !== null);
  // On a phone only the list or one page fits: a page when it was opened on one.
  const [showing, setShowing] = useState(() => useUI.getState().settingsDirect);
  const close = () => setOpen(false);
  const sections = SETTINGS_SECTIONS.filter((id) => id !== 'desktop' || desktop);
  const current = sections.includes(section) ? section : 'general';
  const names = t.settings.sections;

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
        data-view={showing ? 'page' : 'list'}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <header className="dialog-header">
          <button
            type="button"
            className="icon-btn settings-back"
            aria-label={t.settings.back}
            onClick={() => setShowing(false)}
          >
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <h2 id="settings-title">
            <span className="settings-title-list">{t.settings.title}</span>
            <span className="settings-title-page">{names[current]}</span>
          </h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t.settings.title}>
            {sections.map((id) => {
              const Icon = ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="settings-nav-item"
                  aria-current={id === current ? 'page' : undefined}
                  onClick={() => {
                    setSection(id);
                    setShowing(true);
                  }}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span>{names[id]}</span>
                  <ChevronRight size={18} strokeWidth={1.75} className="settings-nav-more" />
                </button>
              );
            })}
          </nav>
          {/* Keyed by the page, so each one starts scrolled to the top. */}
          <div key={current} className="settings-body" data-scrollable>
            <h3 className="settings-page-title">{names[current]}</h3>
            <Page id={current} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Page({ id }: { id: SettingsSection }) {
  switch (id) {
    case 'general':
      return <General />;
    case 'look':
      return (
        <>
          <ThemeRow />
          <BookStyleSection />
        </>
      );
    case 'desktop':
      return <DesktopRows />;
    case 'privacy':
      return <PrivacySection />;
    case 'account':
      return <AccountSection />;
    case 'data':
      return <Storage />;
    case 'help':
      return <Help />;
  }
}

/** Language, theme and how the diary behaves (and on Windows, starting and updating). */
function General() {
  const t = useT();
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  return (
    <>
      <SettingsRow label={t.settings.language}>
        <Choice
          options={Object.entries(LANGUAGES) as [Language, string][]}
          value={settings.language}
          onChange={(language) => setSettings({ language })}
        />
      </SettingsRow>
      <ThemeRow />
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
      <DesktopStartRows />
    </>
  );
}

/** Light, dark or the system's: in General and, with the rest of the look, in the diary's. */
function ThemeRow() {
  const t = useT();
  const themePreference = useUI((s) => s.themePreference);
  const setThemePreference = useUI((s) => s.setThemePreference);
  return (
    <SettingsRow label={t.settings.theme}>
      <Choice
        options={THEMES.map((id) => [id, t.settings.themes[id]])}
        value={themePreference}
        onChange={setThemePreference}
      />
    </SettingsRow>
  );
}

/** Where and how much is saved, how to protect it, and the backups. */
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
    <>
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
      <SettingsRow label={t.settings.openCopy} hint={t.settings.openCopyHint}>
        <button type="button" className="settings-btn" onClick={pickCopy}>
          <FolderOpen size={15} strokeWidth={1.75} /> {t.settings.open}
        </button>
      </SettingsRow>
      <DesktopBackups />
    </>
  );
}

/** The shortcuts, and about diaryo: the website, the code and the legal pages. */
function Help() {
  const t = useT();
  const s = t.settings;
  return (
    <>
      <SettingsRow label={s.shortcuts} hint={s.shortcutsHint}>
        <button
          type="button"
          className="settings-btn"
          onClick={() => {
            useUI.getState().setSettingsOpen(false);
            useUI.getState().setHelpOpen(true);
          }}
        >
          <Keyboard size={15} strokeWidth={1.75} /> {s.showShortcuts}
        </button>
      </SettingsRow>
      <section className="settings-group">
        <h4>{s.about}</h4>
        <div className="account-legal-links settings-about">
          <WebsiteLink href={s.websiteUrl}>{s.website}</WebsiteLink>
          <WebsiteLink href={s.sourceUrl}>{s.source}</WebsiteLink>
        </div>
        <LegalLinks />
      </section>
    </>
  );
}
