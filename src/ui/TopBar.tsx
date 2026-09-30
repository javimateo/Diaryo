import {
  Check,
  CloudAlert,
  Download,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { exportPng, openCopy, saveCopy } from './fileActions';
import { FILE_EXTENSION } from '../storage/files';
import { WindowControls } from './desktop/WindowControls';
import { useUI } from '../store/ui';
import { useT } from './useT';

export function Brand() {
  const t = useT();
  const status = useUI((s) => s.saveStatus);
  const widget = useUI((s) => s.desktop?.mode === 'widget');
  const Icon = status === 'saved' ? Check : status === 'error' ? CloudAlert : LoaderCircle;
  return (
    <div className="brand">
      diaryo
      <span className="save-status" data-status={status} role="status">
        <Icon size={13} strokeWidth={2} />
        {t.status[status]}
      </span>
      {widget && (
        <span className="widget-hint">
          <kbd>Esc</kbd> {t.brand.widgetHint}
        </span>
      )}
    </div>
  );
}

export function TopActions() {
  const t = useT();
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);

  return (
    <div className="top-actions floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.topBar.search}
        data-tip={`${t.topBar.search} — Ctrl K`}
        data-tip-align="end"
        onClick={() => setPaletteOpen(true)}
      >
        <Search size={18} strokeWidth={1.75} />
      </button>
      <FileMenu />
      <button
        type="button"
        className="icon-btn theme-btn"
        aria-label={t.topBar.theme(theme === 'dark')}
        data-tip={`${t.topBar.theme(theme === 'dark')} — Alt Shift D`}
        data-tip-align="end"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? (
          <Sun size={18} strokeWidth={1.75} />
        ) : (
          <Moon size={18} strokeWidth={1.75} />
        )}
      </button>
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

/** Images, backups and export. Normal saving is automatic. */
function FileMenu() {
  const t = useT();
  const engine = useUI((s) => s.engine);
  const desktop = useUI((s) => s.desktop !== null);
  const diary = useUI((s) => s.diary);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
        data-tip={open ? undefined : t.topBar.menuTip}
        data-tip-align="end"
        onClick={() => setOpen(!open)}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {open && engine && diary && (
        <div className="dropdown floating" role="menu">
          <p className="dropdown-note">{t.topBar.savedWhere(desktop)}</p>
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
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
          >
            <span className="menu-label">
              <FolderOpen size={15} strokeWidth={1.75} /> {t.topBar.openCopy}
            </span>
          </button>
          <div className="menu-divider" role="separator" />
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
      <input
        ref={fileRef}
        type="file"
        accept={`${FILE_EXTENSION},application/json`}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && engine) void openCopy(engine, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
