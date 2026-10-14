import {
  AppWindow,
  BookOpen,
  CalendarClock,
  Image,
  Layers,
  Link,
  LockKeyhole,
  Magnet,
  Map,
  Paintbrush,
  Search,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react';
import { shortcutKeys } from '../desktop/shortcuts';
import type { DesktopInfo } from '../desktop/settings';
import type { Messages } from '../i18n';
import { TOOLS } from './toolDefs';

/**
 * What the help says (the app's Help window and the website's help page): the shortcuts
 * and how each thing is used. Plain data, with the texts of the language given.
 */

/** The desktop app's shortcuts (the floating diary and the desk on the desktop). */
export type DesktopShortcuts = Pick<DesktopInfo, 'shortcut' | 'deskShortcut'>;

/** A shortcut: what it does and its combinations (any of them works). */
export type Shortcut = [string, string[][]];

/**
 * The shortcut lists, with the texts and key names of the active language. `desktop`: the
 * desktop app's own shortcuts (null outside it).
 */
export function shortcutLists(t: Messages, desktop: DesktopShortcuts | null) {
  const { help: h, keys: k } = t;
  const navigation: Shortcut[] = [
    [h.moveCanvas, [[k.space, k.drag], [k.middleButton]]],
    [h.scroll, [[k.wheel]]],
    [h.scrollSideways, [['Shift', k.wheelLower]]],
    [h.zoom, [['Ctrl', k.wheelLower]]],
    [
      h.zoomInOut,
      [
        ['Ctrl', '+'],
        ['Ctrl', '−'],
      ],
    ],
    [h.resetZoom, [['Ctrl', '0']]],
    [h.seeAll, [['Shift', '1']]],
  ];
  const selection: Shortcut[] = [
    [h.lasso, [['Alt', k.drag]]],
    [h.addToSelection, [['Shift', k.click]]],
    [h.selectAll, [['Ctrl', 'A']]],
    [
      h.copyCutPaste,
      [
        ['Ctrl', 'C'],
        ['Ctrl', 'X'],
        ['Ctrl', 'V'],
      ],
    ],
    [h.duplicate, [['Ctrl', 'D']]],
    [h.delete, [[k.delete]]],
    [h.nudge, [[k.arrows], ['Shift', k.arrowsLower]]],
    [h.scaleFree, [['Shift', k.corner]]],
    [h.scaleFromCenter, [['Alt', k.handle]]],
    [h.rotateSnap, [['Shift', k.rotate]]],
    [h.noGuides, [['Ctrl', k.drag]]],
    [
      h.group,
      [
        ['Ctrl', 'G'],
        ['Ctrl', 'Shift', 'G'],
      ],
    ],
    [
      h.bringForward,
      [
        ['Ctrl', '↑'],
        ['Ctrl', '↓'],
      ],
    ],
    [
      h.bringToFront,
      [
        ['Ctrl', 'Shift', '↑'],
        ['Ctrl', 'Shift', '↓'],
      ],
    ],
    [
      h.flip,
      [
        ['Shift', 'H'],
        ['Shift', 'V'],
      ],
    ],
    [h.lock, [['Ctrl', 'Shift', 'L']]],
    [
      h.copyStyle,
      [
        ['Ctrl', 'Alt', 'C'],
        ['Ctrl', 'Alt', 'V'],
      ],
    ],
    [h.copyAsImage, [['Shift', 'Alt', 'C']]],
    [h.moreOptions, [[k.rightClick]]],
    [h.deselect, [['Esc']]],
  ];
  const writing: Shortcut[] = [
    [h.writeAnywhere, [[k.doubleClick]]],
    [h.editSelected, [['Enter']]],
    [h.finishWriting, [['Esc'], ['Ctrl', 'Enter']]],
    [h.textBox, [['T', k.drag]]],
    [
      h.list,
      [
        ['-', k.spaceLower],
        ['1.', k.spaceLower],
      ],
    ],
    [h.task, [['[]', k.spaceLower]]],
    [h.indent, [['Tab'], ['Shift', 'Tab']]],
    [h.pasteImages, [['Ctrl', 'V']]],
    [h.addImages, [[k.dragFiles]]],
    [h.writeInShape, [[k.doubleClick], ['Enter']]],
    [h.squareShape, [['Shift', k.drag]]],
    [h.shapeFromCenter, [['Alt', k.drag]]],
    [h.connect, [['A', k.fromOneToOther]]],
    [h.curveArrow, [[k.dragItsCenter]]],
  ];
  const diary: Shortcut[] = [
    [
      h.turnPage,
      [
        ['Ctrl', '←'],
        ['Ctrl', '→'],
      ],
    ],
    [h.prevNextPage, [[k.pageUp], [k.pageDown]]],
    [h.goToToday, [['Ctrl', k.home]]],
    [h.newPage, [['Alt', 'N']]],
    [h.bookmark, [['Alt', 'M']]],
    [h.link, [[k.rightClick], [k.panel]]],
    [h.index, [['Ctrl', 'B']]],
    [h.map, [['Shift', 'M']]],
  ];
  const general: Shortcut[] = [
    [
      h.search,
      [
        ['Ctrl', 'K'],
        ['Ctrl', 'F'],
      ],
    ],
    [h.size, [['+'], ['−']]],
    [h.undo, [['Ctrl', 'Z']]],
    [
      h.redo,
      [
        ['Ctrl', 'Shift', 'Z'],
        ['Ctrl', 'Y'],
      ],
    ],
    [h.showShortcuts, [['?']]],
    [h.settings, [['Ctrl', ',']]],
    [h.theme, [['Alt', 'Shift', 'D']]],
  ];
  // In the desktop app, also the floating diary.
  if (desktop) {
    general.push(
      [h.floatingDiary, [shortcutKeys(desktop.shortcut, k.space)]],
      [h.hideFloatingDiary, [['Esc']]],
      [h.toggleDeskLayer, [shortcutKeys(desktop.deskShortcut, k.space)]],
    );
  }
  return { navigation, selection, writing, diary, general };
}

/** A line of "How to use it": its icon, name, what it does and its keys (if any). */
export interface HowTo {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  keys: string[][];
}

/** The tools and the gestures and tips, each in a line. */
export function howToLists(t: Messages, desktop: DesktopShortcuts | null) {
  const { help: h, keys: k } = t;
  const g = h.gestures;
  const tools: HowTo[] = TOOLS.map((tool) => ({
    id: tool.id,
    icon: tool.icon,
    title: t.tools.names[tool.id],
    text: h.toolUses[tool.id],
    keys: [[tool.key.toUpperCase()]],
  }));
  const gesture = (id: keyof typeof g, icon: LucideIcon, keys: string[][] = []): HowTo => ({
    id,
    icon,
    ...g[id],
    keys,
  });
  const gestures: HowTo[] = [
    gesture('turn', BookOpen, [
      ['Ctrl', '←'],
      ['Ctrl', '→'],
    ]),
    gesture('desk', Layers),
    gesture('tasks', SquareCheck, [['[]', k.spaceLower]]),
    gesture('dates', CalendarClock, [['@']]),
    gesture('private', LockKeyhole),
    gesture('link', Link),
    gesture('images', Image, [['Ctrl', 'V']]),
    gesture('search', Search, [['Ctrl', 'K']]),
    gesture('map', Map, [
      ['Shift', 'M'],
      ['Ctrl', 'B'],
    ]),
    gesture('copyStyle', Paintbrush, [['Ctrl', 'Alt', 'C']]),
    gesture('guides', Magnet),
  ];
  if (desktop)
    gestures.push(gesture('floating', AppWindow, [shortcutKeys(desktop.shortcut, k.space)]));
  return { tools, gestures };
}
