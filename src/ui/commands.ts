import {
  AppWindow,
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  Bookmark,
  BookmarkX,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  FilePlus2,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Frame,
  Group,
  Image as ImageIcon,
  ImageDown,
  Keyboard,
  LayoutGrid,
  Link,
  Lock,
  LockOpen,
  Moon,
  Palette,
  PanelsTopLeft,
  PenLine,
  Power,
  Redo2,
  Save,
  Settings,
  Sun,
  SunMoon,
  Trash2,
  Undo2,
  Ungroup,
  Unlink,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import {
  PAPER_COLORS,
  PAPERS,
  type Binding,
  type PaperColor,
  type PaperStyle,
} from '../engine/book';
import { MATERIALS, type CoverMaterial } from '../engine/cover';
import { DESKS, type DeskStyle } from '../engine/desk';
import { exportPng, openCopy, saveCopy } from '../storage/actions';
import { FILE_EXTENSION } from '../storage/files';
import { useUI } from '../store/ui';
import {
  addPage,
  deletePage,
  goToToday,
  setPagePaper,
  toggleBookmark,
  turnPage,
} from './diaryActions';
import { BINDINGS } from './BookStyleSection';
import {
  backupDesktop,
  hideDesktop,
  openBackupDir,
  quitDesktop,
  shortcutKeys,
  showDesktopMode,
} from '../desktop/desktop';
import { TOOLS } from './toolDefs';

/** Lo que pide un comando que necesita que se escriba algo (p. ej. un título). */
export interface CommandPrompt {
  title: string;
  placeholder: string;
  initial: string;
  submit: (value: string) => void;
}

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  /** Atajo de teclado, tecla a tecla. */
  keys?: string[];
  /** Otras palabras con las que encontrarlo. */
  keywords?: string;
  /** Está puesto ahora (p. ej. el tipo de hoja elegido). */
  checked?: boolean;
  /** Hace lo suyo, o pide que se escriba algo antes (lo que devuelvan las acciones del motor da igual). */
  run: () => CommandPrompt | boolean | void;
}

/** Abre el selector de archivos para abrir una copia del diario. */
function pickBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},application/json`;
  input.onchange = () => {
    const file = input.files?.[0];
    const { engine, diary } = useUI.getState();
    if (file && engine && diary) void openCopy(engine, diary, file);
  };
  input.click();
}

/** Todo lo que se puede hacer desde la paleta, según cómo esté ahora la app. */
export function getCommands(): Command[] {
  const state = useUI.getState();
  const { engine, diary, doc, themePreference, bookStyle, diaryState } = state;
  if (!engine) return [];
  const current = diaryState.current;
  const saved = !!current && diaryState.pages.some((p) => p.id === current.id);
  const commands: Command[] = [];
  const add = (group: string, list: (Omit<Command, 'group'> | false)[]) => {
    for (const command of list) if (command) commands.push({ ...command, group });
  };

  add('Diario', [
    {
      id: 'today',
      label: 'Ir a hoy',
      icon: CalendarDays,
      keys: ['Ctrl', 'Inicio'],
      run: goToToday,
    },
    {
      id: 'new-page',
      label: 'Nueva página',
      icon: FilePlus2,
      keys: ['Alt', 'N'],
      keywords: 'hoja añadir crear',
      run: addPage,
    },
    {
      id: 'next-page',
      label: 'Página siguiente',
      icon: ChevronRight,
      keys: ['Ctrl', '→'],
      keywords: 'pasar hoja',
      run: () => void turnPage(1),
    },
    {
      id: 'prev-page',
      label: 'Página anterior',
      icon: ChevronLeft,
      keys: ['Ctrl', '←'],
      keywords: 'pasar hoja volver',
      run: () => void turnPage(-1),
    },
    !!current && {
      id: 'rename',
      label: current.title ? 'Cambiar el título de la página' : 'Poner título a la página',
      icon: PenLine,
      keywords: 'nombre renombrar',
      run: () => ({
        title: 'Título de la página',
        placeholder: 'Por ejemplo: Viaje a Lisboa',
        initial: current.title,
        submit: (title: string) => void diary?.rename(current.id, title),
      }),
    },
    !!current && {
      id: 'bookmark',
      label: current.bookmark
        ? 'Quitar la pestaña de la página'
        : 'Marcar la página como importante',
      icon: current.bookmark ? BookmarkX : Bookmark,
      keys: ['Alt', 'M'],
      keywords: 'pestaña marcador favorita',
      run: () => toggleBookmark(),
    },
    {
      id: 'map',
      label: 'Mapa del diario',
      icon: LayoutGrid,
      keys: ['Shift', 'M'],
      keywords: 'todas las páginas vista general',
      run: () => useUI.getState().setMapOpen(true),
    },
    {
      id: 'index',
      label: 'Índice y calendario',
      icon: BookOpen,
      keys: ['Ctrl', 'B'],
      keywords: 'lista páginas meses',
      run: () => useUI.getState().setDiaryOpen(true),
    },
    saved && {
      id: 'delete-page',
      label: 'Borrar esta página',
      icon: Trash2,
      keywords: 'eliminar hoja',
      run: () => void deletePage(current.id),
    },
  ]);

  const selected = doc.selectionCount > 0;
  add('Selección', [
    selected && {
      id: 'duplicate',
      label: 'Duplicar',
      icon: Copy,
      keys: ['Ctrl', 'D'],
      run: () => engine.duplicateSelection(),
    },
    selected && {
      id: 'link',
      label: doc.selectionHasLink ? 'Cambiar el enlace…' : 'Enlazar con una página…',
      icon: Link,
      keywords: 'enlace vincular',
      run: () => useUI.getState().setLinkDialogOpen(true),
    },
    selected &&
      doc.selectionHasLink && {
        id: 'unlink',
        label: 'Quitar el enlace',
        icon: Unlink,
        run: () => engine.setSelectionLink(null),
      },
    doc.selectionCount > 1 && {
      id: 'group',
      label: 'Agrupar',
      icon: Group,
      keys: ['Ctrl', 'G'],
      run: () => engine.groupSelection(),
    },
    doc.selectionGrouped && {
      id: 'ungroup',
      label: 'Desagrupar',
      icon: Ungroup,
      keys: ['Ctrl', 'Shift', 'G'],
      run: () => engine.ungroupSelection(),
    },
    selected && {
      id: 'front',
      label: 'Traer al frente',
      icon: ArrowUpToLine,
      keys: ['Ctrl', 'Shift', '↑'],
      keywords: 'capa encima',
      run: () => engine.arrangeSelection('front'),
    },
    selected && {
      id: 'back',
      label: 'Enviar al fondo',
      icon: ArrowDownToLine,
      keys: ['Ctrl', 'Shift', '↓'],
      keywords: 'capa debajo',
      run: () => engine.arrangeSelection('back'),
    },
    selected && {
      id: 'flip-h',
      label: 'Voltear en horizontal',
      icon: FlipHorizontal2,
      keys: ['Shift', 'H'],
      keywords: 'espejo',
      run: () => engine.flipSelection('horizontal'),
    },
    selected && {
      id: 'flip-v',
      label: 'Voltear en vertical',
      icon: FlipVertical2,
      keys: ['Shift', 'V'],
      keywords: 'espejo',
      run: () => engine.flipSelection('vertical'),
    },
    selected && {
      id: 'lock',
      label: doc.selectionLocked ? 'Desbloquear' : 'Bloquear',
      icon: doc.selectionLocked ? LockOpen : Lock,
      keys: ['Ctrl', 'Shift', 'L'],
      keywords: 'fijar',
      run: () => engine.toggleLockSelection(),
    },
    selected && {
      id: 'copy-png',
      label: 'Copiar como imagen',
      icon: ImageIcon,
      keys: ['Shift', 'Alt', 'C'],
      keywords: 'png portapapeles',
      run: () =>
        void engine
          .copySelectionAsPng()
          .then((ok) =>
            useUI.getState().showToast(ok ? 'Imagen copiada' : 'No se ha podido copiar la imagen'),
          ),
    },
    selected && {
      id: 'delete',
      label: 'Borrar lo seleccionado',
      icon: Trash2,
      keys: ['Supr'],
      keywords: 'eliminar',
      run: () => engine.deleteSelection(),
    },
  ]);

  add(
    'Herramientas',
    TOOLS.map((tool) => ({
      id: `tool-${tool.id}`,
      label: tool.label,
      icon: tool.icon,
      keys: [tool.key.toUpperCase()],
      keywords: 'herramienta',
      checked: state.tool === tool.id,
      run: () => state.setTool(tool.id),
    })),
  );

  add('Editar', [
    {
      id: 'undo',
      label: 'Deshacer',
      icon: Undo2,
      keys: ['Ctrl', 'Z'],
      run: () => engine.undo(),
    },
    {
      id: 'redo',
      label: 'Rehacer',
      icon: Redo2,
      keys: ['Ctrl', 'Shift', 'Z'],
      run: () => engine.redo(),
    },
    {
      id: 'select-all',
      label: 'Seleccionar todo',
      icon: Frame,
      keys: ['Ctrl', 'A'],
      run: () => {
        engine.selectAll();
        if (state.tool !== 'select' && state.tool !== 'lasso') state.setTool('select');
      },
    },
    doc.hasLocked && {
      id: 'unlock-all',
      label: 'Desbloquear todo',
      icon: LockOpen,
      run: () => engine.unlockAll(),
    },
  ]);

  add('Ver', [
    {
      id: 'fit',
      label: 'Ver todo',
      icon: Frame,
      keys: ['Shift', '1'],
      keywords: 'encajar ajustar zoom',
      run: () => engine.zoomToFit(),
    },
    {
      id: 'zoom-in',
      label: 'Acercar',
      icon: ZoomIn,
      keys: ['Ctrl', '+'],
      keywords: 'zoom',
      run: () => engine.zoomIn(),
    },
    {
      id: 'zoom-out',
      label: 'Alejar',
      icon: ZoomOut,
      keys: ['Ctrl', '−'],
      keywords: 'zoom',
      run: () => engine.zoomOut(),
    },
    {
      id: 'theme-light',
      label: 'Tema claro',
      icon: Sun,
      keywords: 'día modo apariencia',
      checked: themePreference === 'light',
      run: () => state.setThemePreference('light'),
    },
    {
      id: 'theme-dark',
      label: 'Tema oscuro',
      icon: Moon,
      keywords: 'noche modo apariencia',
      checked: themePreference === 'dark',
      run: () => state.setThemePreference('dark'),
    },
    {
      id: 'theme-system',
      label: 'Tema como el sistema',
      icon: SunMoon,
      keywords: 'automático modo apariencia',
      checked: themePreference === 'system',
      run: () => state.setThemePreference('system'),
    },
    {
      id: 'settings',
      label: 'Ajustes',
      icon: Settings,
      keys: ['Ctrl', ','],
      keywords: 'configuración preferencias opciones',
      run: () => state.setSettingsOpen(true),
    },
    {
      id: 'help',
      label: 'Atajos de teclado',
      icon: Keyboard,
      keys: ['?'],
      keywords: 'ayuda teclas',
      run: () => state.setHelpOpen(true),
    },
  ]);

  add('Aspecto del diario', [
    ...(Object.keys(PAPERS) as PaperStyle[]).map((paper) => ({
      id: `paper-${paper}`,
      label: `Hoja del diario: ${PAPERS[paper]}`,
      icon: Palette,
      keywords: 'papel fondo',
      checked: bookStyle.paper === paper,
      run: () => state.setBookStyle({ paper }),
    })),
    ...(current
      ? [
          ...(Object.keys(PAPERS) as PaperStyle[]).map((paper) => ({
            id: `page-paper-${paper}`,
            label: `Hoja de esta página: ${PAPERS[paper]}`,
            icon: Palette,
            keywords: 'papel fondo',
            checked: current.paper === paper,
            run: () => setPagePaper(paper),
          })),
          ...(current.paper
            ? [
                {
                  id: 'page-paper-default',
                  label: 'Hoja de esta página: la del diario',
                  icon: Palette,
                  keywords: 'papel fondo',
                  run: () => setPagePaper(null),
                },
              ]
            : []),
        ]
      : []),
    ...(Object.keys(PAPER_COLORS) as PaperColor[]).map((paperColor) => ({
      id: `paper-color-${paperColor}`,
      label: `Color de hoja: ${PAPER_COLORS[paperColor].name}`,
      icon: Palette,
      keywords: 'papel fondo',
      checked: bookStyle.paperColor === paperColor,
      run: () => state.setBookStyle({ paperColor }),
    })),
    ...(Object.keys(BINDINGS) as Binding[]).map((binding) => ({
      id: `binding-${binding}`,
      label: `Encuadernación: ${BINDINGS[binding]}`,
      icon: BookOpen,
      keywords: 'libreta cuaderno',
      checked: bookStyle.binding === binding,
      run: () => state.setBookStyle({ binding }),
    })),
    ...(Object.keys(MATERIALS) as CoverMaterial[]).map((material) => ({
      id: `material-${material}`,
      label: `Tapas: ${MATERIALS[material]}`,
      icon: BookOpen,
      keywords: 'material',
      checked: bookStyle.material === material,
      run: () => state.setBookStyle({ material }),
    })),
    {
      id: 'elastic',
      label: bookStyle.elastic ? 'Quitar la goma elástica' : 'Poner la goma elástica',
      icon: BookOpen,
      keywords: 'tapas',
      run: () => state.setBookStyle({ elastic: !bookStyle.elastic }),
    },
    ...(Object.keys(DESKS) as DeskStyle[]).map((desk) => ({
      id: `desk-${desk}`,
      label: `Mesa: ${DESKS[desk]}`,
      icon: Palette,
      keywords: 'fondo',
      checked: bookStyle.desk === desk,
      run: () => state.setBookStyle({ desk }),
    })),
  ]);

  add('Archivo', [
    !!diary && {
      id: 'save-copy',
      label: 'Guardar una copia del diario',
      icon: Download,
      keywords: 'copia de seguridad exportar descargar backup',
      run: () => void saveCopy(diary),
    },
    {
      id: 'open-copy',
      label: 'Abrir una copia…',
      icon: FolderOpen,
      keywords: 'importar recuperar backup',
      run: pickBackup,
    },
    {
      id: 'export-png',
      label: 'Exportar la página como imagen',
      icon: ImageDown,
      keywords: 'png descargar',
      run: () => void exportPng(engine),
    },
  ]);

  const desktop = state.desktop;
  if (desktop) {
    add('Escritorio', [
      desktop.mode === 'window'
        ? {
            id: 'widget',
            label: 'Diario flotante',
            icon: PanelsTopLeft,
            keys: shortcutKeys(desktop.shortcut),
            keywords: 'widget escritorio encima',
            run: () => void showDesktopMode('widget'),
          }
        : {
            id: 'window',
            label: 'Abrir en una ventana',
            icon: AppWindow,
            keywords: 'ventana normal',
            run: () => void showDesktopMode('window'),
          },
      {
        id: 'hide',
        label: 'Esconder diaryo',
        icon: EyeOff,
        keys: desktop.mode === 'widget' ? ['Esc'] : undefined,
        keywords: 'bandeja minimizar cerrar',
        run: () => void hideDesktop(),
      },
      desktop.backups && {
        id: 'backup-now',
        label: 'Copiar el diario ahora',
        icon: Save,
        keywords: 'copia automática guardar carpeta backup',
        run: () => void backupDesktop(),
      },
      {
        id: 'backup-folder',
        label: 'Abrir la carpeta de las copias',
        icon: FolderOpen,
        keywords: 'copias automáticas backup',
        run: () => void openBackupDir(),
      },
      {
        id: 'quit',
        label: 'Salir de diaryo',
        icon: Power,
        keywords: 'cerrar terminar',
        run: () => void quitDesktop(),
      },
    ]);
  }

  return commands;
}
