import {
  Check,
  CloudAlert,
  CloudCheck,
  CloudOff,
  CloudUpload,
  Download,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Keyboard,
  LockKeyhole,
  Menu,
  Search,
  Settings,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { exportPng, pickCopy, saveCopy } from './fileActions';
import { FILE_EXTENSION } from '../storage/files';
import { WindowControls } from './desktop/WindowControls';
import { BrandMark } from './BrandMark';
import { useUI, type ThemePreference } from '../store/ui';
import { useLock } from '../cloud/lockState';
import { Choice } from './Choice';
import { lockDiaryNow } from './lockActions';
import { useSync } from './cloudSync';
import { relativeTime } from './relativeTime';
import { useT } from './useT';

export function Brand() {
  const t = useT();
  const status = useUI((s) => s.saveStatus);
  const widget = useUI((s) => s.desktop?.mode === 'widget');
  const Icon = status === 'saved' ? Check : status === 'error' ? CloudAlert : LoaderCircle;
  return (
    <div className="brand">
      <BrandMark />
      <span className="brand-name">diaryo</span>
      <span className="save-status" data-status={status} role="status">
        <Icon size={13} strokeWidth={2} />
        <span className="save-status-text">{t.status[status]}</span>
      </span>
      <SyncIndicator />
      {widget && (
        <span className="widget-hint">
          <kbd>Esc</kbd> {t.brand.widgetHint}
        </span>
      )}
    </div>
  );
}

/** The cloud, next to "Saved": up to date, syncing, offline or full. Opens the settings. */
function SyncIndicator() {
  const t = useT();
  const { status, lastSync, pending } = useSync();
  const manual = useUI((s) => s.settings.syncMode !== 'auto');
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);
  if (status === 'off') return null;
  const tips = t.sync.tips;
  let tip: string;
  if (status === 'idle') {
    tip = manual ? tips.manual(pending) : tips.idle(lastSync ? relativeTime(lastSync) : '—');
  } else tip = tips[status];
  const waiting = status === 'idle' && manual && pending > 0;
  const Icon =
    status === 'syncing' || waiting
      ? CloudUpload
      : status === 'offline'
        ? CloudOff
        : status === 'idle'
          ? CloudCheck
          : CloudAlert;
  return (
    <button
      type="button"
      className="sync-indicator icon-btn"
      data-status={waiting ? 'waiting' : status}
      data-tip={tip}
      aria-label={tip}
      onClick={() => setSettingsOpen(true, 'account')}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}

export function TopActions() {
  const t = useT();
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);

  return (
    <div className="top-actions floating" onMouseDown={(e) => e.preventDefault()}>
      {/* On a phone the brand (and its cloud) is hidden, so the cloud lives here. */}
      <SyncIndicator />
      <button
        type="button"
        className="icon-btn search-btn"
        aria-label={t.topBar.search}
        data-tip={`${t.topBar.search} — Ctrl K`}
        data-tip-align="end"
        onClick={() => setPaletteOpen(true)}
      >
        <Search size={18} strokeWidth={1.75} />
        <span className="search-label">{t.topBar.searchLabel}</span>
        <kbd className="search-label">Ctrl K</kbd>
      </button>
      <span className="top-actions-separator" aria-hidden />
      <MainMenu />
      <button
        type="button"
        className="icon-btn"
        aria-label={t.topBar.settings}
        data-tip={`${t.topBar.settings} — Ctrl ,`}
        data-tip-align="end"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={18} strokeWidth={1.75} />
      </button>
      <WindowControls />
    </div>
  );
}

const THEMES: ThemePreference[] = ['light', 'dark', 'system'];

/** Images, backups, export, the theme, locking and the shortcuts. Saving is automatic. */
function MainMenu() {
  const t = useT();
  const engine = useUI((s) => s.engine);
  const desktop = useUI((s) => s.desktop !== null);
  const diary = useUI((s) => s.diary);
  const themePreference = useUI((s) => s.themePreference);
  const setThemePreference = useUI((s) => s.setThemePreference);
  const canLock = useLock((s) => s.status === 'unlocked');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc only closes the menu (it doesn't put the floating diary away).
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="file-menu">
      <button
        type="button"
        className="icon-btn"
        aria-label={t.topBar.menu}
        aria-expanded={open}
        data-active={open || undefined}
        data-tip={open ? undefined : t.topBar.menuTip}
        data-tip-align="end"
        onClick={() => setOpen(!open)}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {open && engine && diary && (
        <div className="dropdown floating" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              imageRef.current?.click();
            }}
          >
            <span className="menu-label">
              <ImagePlus size={15} strokeWidth={1.75} /> {t.topBar.insertImage}
            </span>
          </button>
          <div className="menu-divider" role="separator" />
          <p className="menu-heading">{t.topBar.copies}</p>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void saveCopy(diary))}
          >
            <span className="menu-label">
              <Download size={15} strokeWidth={1.75} /> {t.topBar.saveCopy}
            </span>
            <kbd>{FILE_EXTENSION}</kbd>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={run(pickCopy)}>
            <span className="menu-label">
              <FolderOpen size={15} strokeWidth={1.75} /> {t.topBar.openCopy}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void exportPng(engine))}
          >
            <span className="menu-label">
              <ImageIcon size={15} strokeWidth={1.75} /> {t.topBar.exportPng}
            </span>
            <kbd>.png</kbd>
          </button>
          <div className="menu-divider" role="separator" />
          <p className="menu-heading">{t.settings.theme}</p>
          <div className="menu-choice">
            <Choice
              options={THEMES.map((id) => [id, t.settings.themes[id]])}
              value={themePreference}
              onChange={setThemePreference}
            />
          </div>
          {canLock && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={run(() => void lockDiaryNow())}
            >
              <span className="menu-label">
                <LockKeyhole size={15} strokeWidth={1.75} /> {t.commands.lockDiary}
              </span>
            </button>
          )}
          <div className="menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => useUI.getState().setHelpOpen(true))}
          >
            <span className="menu-label">
              <Keyboard size={15} strokeWidth={1.75} /> {t.settings.shortcuts}
            </span>
            <kbd>?</kbd>
          </button>
          <p className="dropdown-note">{t.topBar.savedWhere(desktop)}</p>
        </div>
      )}
      {/* On a phone it offers the gallery or the camera. */}
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0) void engine?.insertImageFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
