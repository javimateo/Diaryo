import {
  Check,
  CloudAlert,
  Download,
  FolderOpen,
  Image as ImageIcon,
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

const STATUS_TEXT = {
  loading: 'Cargando…',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se ha podido guardar',
} as const;

export function Brand() {
  const status = useUI((s) => s.saveStatus);
  const widget = useUI((s) => s.desktop?.mode === 'widget');
  const Icon = status === 'saved' ? Check : status === 'error' ? CloudAlert : LoaderCircle;
  return (
    <div className="brand">
      diaryo
      <span className="save-status" data-status={status} role="status">
        <Icon size={13} strokeWidth={2} />
        {STATUS_TEXT[status]}
      </span>
      {widget && (
        <span className="widget-hint">
          <kbd>Esc</kbd> para apartarlo
        </span>
      )}
    </div>
  );
}

export function TopActions() {
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);

  return (
    <div className="top-actions floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Buscar y comandos"
        data-tip="Buscar y comandos — Ctrl K"
        data-tip-align="end"
        onClick={() => setPaletteOpen(true)}
      >
        <Search size={18} strokeWidth={1.75} />
      </button>
      <FileMenu />
      <button
        type="button"
        className="icon-btn"
        aria-label="Cambiar tema"
        data-tip={`Tema ${theme === 'dark' ? 'claro' : 'oscuro'} — Alt Shift D`}
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
        aria-label="Ajustes"
        data-tip="Ajustes — Ctrl ,"
        data-tip-align="end"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={18} strokeWidth={1.75} />
      </button>
      <WindowControls />
    </div>
  );
}

/** Copias de seguridad y exportar. El guardado normal es automático. */
function FileMenu() {
  const engine = useUI((s) => s.engine);
  const desktop = useUI((s) => s.desktop !== null);
  const diary = useUI((s) => s.diary);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc solo cierra el menú (no aparta el diario flotante).
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
        aria-label="Menú"
        aria-expanded={open}
        data-tip={open ? undefined : 'Copias y exportar'}
        data-tip-align="end"
        onClick={() => setOpen(!open)}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {open && engine && diary && (
        <div className="dropdown floating" role="menu">
          <p className="dropdown-note">
            Todo se guarda solo {desktop ? 'en esta app' : 'en este navegador'}.
          </p>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void saveCopy(diary))}
          >
            <span className="menu-label">
              <Download size={15} strokeWidth={1.75} /> Guardar una copia del diario
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
              <FolderOpen size={15} strokeWidth={1.75} /> Abrir una copia
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
              <ImageIcon size={15} strokeWidth={1.75} /> Exportar la página como imagen
            </span>
            <kbd>.png</kbd>
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={`${FILE_EXTENSION},application/json`}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && engine && diary) void openCopy(engine, diary, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
