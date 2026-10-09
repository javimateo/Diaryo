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
  Eye,
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
  LockKeyhole,
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
import { BINDINGS, PAPER_COLORS, PAPER_STYLES, type PaperColor } from '../engine/book';
import { MATERIALS } from '../engine/cover';
import { DESKS } from '../engine/desk';
import { exportPng, openCopy, saveCopy } from './fileActions';
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
import { backupDesktop, hideDesktop, quitDesktop, showDesktopMode } from '../desktop/bridge';
import { openBackupDir } from '../desktop/settings';
import { shortcutKeys } from '../desktop/shortcuts';
import { isConcealed } from '../engine/elements';
import { TOOLS } from './toolDefs';
import { useLock } from '../cloud/lockState';
import { lockDiaryNow } from './lockActions';
import { askToReveal, markPrivate } from './privateActions';
import { hideNotes } from '../cloud/lock';
import { t } from '../i18n';

/** What a command asks for when something needs to be typed (e.g. a title). */
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
  /** Keyboard shortcut, key by key. */
  keys?: string[];
  /** Other words that find it. */
  keywords?: string;
  /** It is currently on (e.g. the chosen paper). */
  checked?: boolean;
  /**
   * Does its thing, or asks for something to be typed first (whatever the engine actions
   * return doesn't matter).
   */
  run: () => CommandPrompt | boolean | void;
}

/** Opens the file picker to open a backup of the diary. */
function pickBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},application/json`;
  input.onchange = () => {
    const file = input.files?.[0];
    const { engine } = useUI.getState();
    if (file && engine) void openCopy(engine, file);
  };
  input.click();
}

/** Everything that can be done from the palette, depending on the current state of the app. */
export function getCommands(): Command[] {
  const state = useUI.getState();
  const { engine, diary, doc, themePreference, bookStyle, diaryState } = state;
  if (!engine) return [];
  const current = diaryState.current;
  const saved = !!current && diaryState.pages.some((p) => p.id === current.id);
  const { commands: c, commandKeywords: kw, commandGroups: g, catalog } = t();
  const commands: Command[] = [];
  const add = (group: string, list: (Omit<Command, 'group'> | false)[]) => {
    for (const command of list) if (command) commands.push({ ...command, group });
  };

  add(g.diary, [
    {
      id: 'today',
      label: c.today,
      icon: CalendarDays,
      keys: ['Ctrl', t().keys.home],
      run: goToToday,
    },
    {
      id: 'new-page',
      label: c.newPage,
      icon: FilePlus2,
      keys: ['Alt', 'N'],
      keywords: kw.newPage,
      run: addPage,
    },
    {
      id: 'next-page',
      label: c.nextPage,
      icon: ChevronRight,
      keys: ['Ctrl', '→'],
      keywords: kw.turn,
      run: () => void turnPage(1),
    },
    {
      id: 'prev-page',
      label: c.prevPage,
      icon: ChevronLeft,
      keys: ['Ctrl', '←'],
      keywords: kw.turnBack,
      run: () => void turnPage(-1),
    },
    !!current && {
      id: 'rename',
      label: current.title ? c.renamePage : c.titlePage,
      icon: PenLine,
      keywords: kw.rename,
      run: () => ({
        title: c.pageTitle,
        placeholder: c.pageTitlePlaceholder,
        initial: current.title,
        submit: (title: string) => void diary?.rename(current.id, title),
      }),
    },
    !!current && {
      id: 'bookmark',
      label: current.bookmark ? c.removeBookmark : c.bookmark,
      icon: current.bookmark ? BookmarkX : Bookmark,
      keys: ['Alt', 'M'],
      keywords: kw.bookmark,
      run: () => toggleBookmark(),
    },
    {
      id: 'map',
      label: c.map,
      icon: LayoutGrid,
      keys: ['Shift', 'M'],
      keywords: kw.map,
      run: () => useUI.getState().setMapOpen(true),
    },
    {
      id: 'index',
      label: c.index,
      icon: BookOpen,
      keys: ['Ctrl', 'B'],
      keywords: kw.index,
      run: () => useUI.getState().setDiaryOpen(true),
    },
    saved && {
      id: 'delete-page',
      label: c.deletePage,
      icon: Trash2,
      keywords: kw.deletePage,
      run: () => void deletePage(current.id),
    },
  ]);

  const selected = doc.selectionCount > 0;
  add(g.selection, [
    selected && {
      id: 'duplicate',
      label: c.duplicate,
      icon: Copy,
      keys: ['Ctrl', 'D'],
      run: () => engine.duplicateSelection(),
    },
    selected && {
      id: 'link',
      label: doc.selectionHasLink ? c.changeLink : c.addLink,
      icon: Link,
      keywords: kw.link,
      run: () => useUI.getState().setLinkDialogOpen(true),
    },
    selected &&
      doc.selectionHasLink && {
        id: 'unlink',
        label: c.unlink,
        icon: Unlink,
        run: () => engine.setSelectionLink(null),
      },
    doc.selectionCount > 1 && {
      id: 'group',
      label: c.group,
      icon: Group,
      keys: ['Ctrl', 'G'],
      run: () => engine.groupSelection(),
    },
    doc.selectionGrouped && {
      id: 'ungroup',
      label: c.ungroup,
      icon: Ungroup,
      keys: ['Ctrl', 'Shift', 'G'],
      run: () => engine.ungroupSelection(),
    },
    selected && {
      id: 'front',
      label: c.front,
      icon: ArrowUpToLine,
      keys: ['Ctrl', 'Shift', '↑'],
      keywords: kw.layerUp,
      run: () => engine.arrangeSelection('front'),
    },
    selected && {
      id: 'back',
      label: c.back,
      icon: ArrowDownToLine,
      keys: ['Ctrl', 'Shift', '↓'],
      keywords: kw.layerDown,
      run: () => engine.arrangeSelection('back'),
    },
    selected && {
      id: 'flip-h',
      label: c.flipH,
      icon: FlipHorizontal2,
      keys: ['Shift', 'H'],
      keywords: kw.mirror,
      run: () => engine.flipSelection('horizontal'),
    },
    selected && {
      id: 'flip-v',
      label: c.flipV,
      icon: FlipVertical2,
      keys: ['Shift', 'V'],
      keywords: kw.mirror,
      run: () => engine.flipSelection('vertical'),
    },
    selected && {
      id: 'lock',
      label: doc.selectionLocked ? c.unlock : c.lock,
      icon: doc.selectionLocked ? LockOpen : Lock,
      keys: ['Ctrl', 'Shift', 'L'],
      keywords: kw.lock,
      run: () => engine.toggleLockSelection(),
    },
    doc.selectionPrivate !== null && {
      id: 'private',
      label: doc.selectionPrivate ? c.unmarkPrivate : c.markPrivate,
      icon: doc.selectionPrivate ? EyeOff : Eye,
      keywords: kw.private,
      run: () =>
        doc.selectionPrivate
          ? engine.setPrivate(engine.selectedNotes(), false)
          : void markPrivate(engine.selectedNotes()),
    },
    selected && {
      id: 'copy-png',
      label: c.copyPng,
      icon: ImageIcon,
      keys: ['Shift', 'Alt', 'C'],
      keywords: kw.copyPng,
      run: () =>
        void engine
          .copySelectionAsPng()
          .then((ok) => useUI.getState().showToast(ok ? c.imageCopied : c.imageCopyFailed)),
    },
    selected && {
      id: 'delete',
      label: c.deleteSelection,
      icon: Trash2,
      keys: [t().keys.delete],
      keywords: kw.delete,
      run: () => engine.deleteSelection(),
    },
  ]);

  add(
    g.tools,
    TOOLS.map((tool) => ({
      id: `tool-${tool.id}`,
      label: t().tools.names[tool.id],
      icon: tool.icon,
      keys: [tool.key.toUpperCase()],
      keywords: kw.tool,
      checked: state.tool === tool.id,
      run: () => state.setTool(tool.id),
    })),
  );

  add(g.edit, [
    {
      id: 'undo',
      label: c.undo,
      icon: Undo2,
      keys: ['Ctrl', 'Z'],
      run: () => engine.undo(),
    },
    {
      id: 'redo',
      label: c.redo,
      icon: Redo2,
      keys: ['Ctrl', 'Shift', 'Z'],
      run: () => engine.redo(),
    },
    {
      id: 'select-all',
      label: c.selectAll,
      icon: Frame,
      keys: ['Ctrl', 'A'],
      run: () => {
        engine.selectAll();
        if (state.tool !== 'select' && state.tool !== 'lasso') state.setTool('select');
      },
    },
    doc.hasLocked && {
      id: 'unlock-all',
      label: c.unlockAll,
      icon: LockOpen,
      run: () => engine.unlockAll(),
    },
  ]);

  add(g.view, [
    {
      id: 'fit',
      label: c.fit,
      icon: Frame,
      keys: ['Shift', '1'],
      keywords: kw.fit,
      run: () => engine.zoomToFit(),
    },
    {
      id: 'zoom-in',
      label: c.zoomIn,
      icon: ZoomIn,
      keys: ['Ctrl', '+'],
      keywords: kw.zoom,
      run: () => engine.zoomIn(),
    },
    {
      id: 'zoom-out',
      label: c.zoomOut,
      icon: ZoomOut,
      keys: ['Ctrl', '−'],
      keywords: kw.zoom,
      run: () => engine.zoomOut(),
    },
    {
      id: 'theme-light',
      label: c.themeLight,
      icon: Sun,
      keywords: kw.light,
      checked: themePreference === 'light',
      run: () => state.setThemePreference('light'),
    },
    {
      id: 'theme-dark',
      label: c.themeDark,
      icon: Moon,
      keywords: kw.dark,
      checked: themePreference === 'dark',
      run: () => state.setThemePreference('dark'),
    },
    {
      id: 'theme-system',
      label: c.themeSystem,
      icon: SunMoon,
      keywords: kw.system,
      checked: themePreference === 'system',
      run: () => state.setThemePreference('system'),
    },
    // Also without the password set here, if hidden ones came from the cloud.
    (useLock.getState().level !== 'off' || engine.scene.all().some(isConcealed)) &&
      (useLock.getState().revealed
        ? {
            id: 'hide-private',
            label: c.hidePrivate,
            icon: EyeOff,
            keywords: kw.private,
            run: () => void hideNotes('all'),
          }
        : {
            id: 'show-private',
            label: c.showPrivate,
            icon: Eye,
            keywords: kw.private,
            run: () => askToReveal('all'),
          }),
    useLock.getState().status === 'unlocked' && {
      id: 'lock-diary',
      label: c.lockDiary,
      icon: LockKeyhole,
      keywords: kw.lockDiary,
      run: () => void lockDiaryNow(),
    },
    {
      id: 'settings',
      label: c.settings,
      icon: Settings,
      keys: ['Ctrl', ','],
      keywords: kw.settings,
      run: () => state.setSettingsOpen(true),
    },
    {
      id: 'help',
      label: c.shortcuts,
      icon: Keyboard,
      keys: ['?'],
      keywords: kw.help,
      run: () => state.setHelpOpen(true),
    },
  ]);

  add(g.bookLook, [
    ...PAPER_STYLES.map((paper) => ({
      id: `paper-${paper}`,
      label: c.diaryPaper(catalog.papers[paper]),
      icon: Palette,
      keywords: kw.paper,
      checked: bookStyle.paper === paper,
      run: () => state.setBookStyle({ paper }),
    })),
    ...(current
      ? [
          ...PAPER_STYLES.map((paper) => ({
            id: `page-paper-${paper}`,
            label: c.pagePaper(catalog.papers[paper]),
            icon: Palette,
            keywords: kw.paper,
            checked: current.paper === paper,
            run: () => setPagePaper(paper),
          })),
          ...(current.paper
            ? [
                {
                  id: 'page-paper-default',
                  label: c.pagePaperDefault,
                  icon: Palette,
                  keywords: kw.paper,
                  run: () => setPagePaper(null),
                },
              ]
            : []),
        ]
      : []),
    ...(Object.keys(PAPER_COLORS) as PaperColor[]).map((paperColor) => ({
      id: `paper-color-${paperColor}`,
      label: c.paperColor(catalog.paperColors[paperColor]),
      icon: Palette,
      keywords: kw.paper,
      checked: bookStyle.paperColor === paperColor,
      run: () => state.setBookStyle({ paperColor }),
    })),
    ...BINDINGS.map((binding) => ({
      id: `binding-${binding}`,
      label: c.binding(catalog.bindings[binding]),
      icon: BookOpen,
      keywords: kw.binding,
      checked: bookStyle.binding === binding,
      run: () => state.setBookStyle({ binding }),
    })),
    ...MATERIALS.map((material) => ({
      id: `material-${material}`,
      label: c.cover(catalog.materials[material]),
      icon: BookOpen,
      keywords: kw.material,
      checked: bookStyle.material === material,
      run: () => state.setBookStyle({ material }),
    })),
    {
      id: 'elastic',
      label: bookStyle.elastic ? c.removeElastic : c.addElastic,
      icon: BookOpen,
      keywords: kw.elastic,
      run: () => state.setBookStyle({ elastic: !bookStyle.elastic }),
    },
    ...DESKS.map((desk) => ({
      id: `desk-${desk}`,
      label: c.desk(catalog.desks[desk]),
      icon: Palette,
      keywords: kw.desk,
      checked: bookStyle.desk === desk,
      run: () => state.setBookStyle({ desk }),
    })),
  ]);

  add(g.file, [
    !!diary && {
      id: 'save-copy',
      label: c.saveCopy,
      icon: Download,
      keywords: kw.saveCopy,
      run: () => void saveCopy(diary),
    },
    {
      id: 'open-copy',
      label: c.openCopy,
      icon: FolderOpen,
      keywords: kw.openCopy,
      run: pickBackup,
    },
    {
      id: 'export-png',
      label: c.exportPng,
      icon: ImageDown,
      keywords: kw.exportPng,
      run: () => void exportPng(engine),
    },
  ]);

  const desktop = state.desktop;
  if (desktop) {
    add(g.desktop, [
      desktop.mode === 'window'
        ? {
            id: 'widget',
            label: c.floatingDiary,
            icon: PanelsTopLeft,
            keys: shortcutKeys(desktop.shortcut, t().keys.space),
            keywords: kw.widget,
            run: () => void showDesktopMode('widget'),
          }
        : {
            id: 'window',
            label: c.openWindow,
            icon: AppWindow,
            keywords: kw.window,
            run: () => void showDesktopMode('window'),
          },
      {
        id: 'hide',
        label: c.hide,
        icon: EyeOff,
        keys: desktop.mode === 'widget' ? ['Esc'] : undefined,
        keywords: kw.hide,
        run: () => void hideDesktop(),
      },
      desktop.backups && {
        id: 'backup-now',
        label: c.backupNow,
        icon: Save,
        keywords: kw.backupNow,
        run: () => void backupDesktop(),
      },
      {
        id: 'backup-folder',
        label: c.backupFolder,
        icon: FolderOpen,
        keywords: kw.backupFolder,
        run: () => void openBackupDir(),
      },
      {
        id: 'quit',
        label: c.quit,
        icon: Power,
        keywords: kw.quit,
        run: () => void quitDesktop(),
      },
    ]);
  }

  return commands;
}
