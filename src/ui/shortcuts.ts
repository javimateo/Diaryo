import type { Messages } from '../i18n';

/**
 * The app's keyboard shortcuts, each once: the command palette and the help show them from
 * here, and useShortcuts.ts runs them (its test checks that every combination here does
 * what it says). The tools' keys are in toolDefs.ts; gestures, the text editor's keys and
 * the desktop app's own shortcuts are only in the help.
 *
 * A key is written as shown; one whose name depends on the language is `{ name }`, its
 * name in `keys` of the texts.
 */
type Key = string | { name: keyof Messages['keys'] };

const home = { name: 'home' } as const;
const del = { name: 'delete' } as const;
const pageUp = { name: 'pageUp' } as const;
const pageDown = { name: 'pageDown' } as const;
const arrows = { name: 'arrows' } as const;
const arrowsLower = { name: 'arrowsLower' } as const;

export const SHORTCUTS = {
  // The diary.
  today: [['Ctrl', home]],
  newPage: [['Alt', 'N']],
  turnForward: [['Ctrl', '→']],
  turnBack: [['Ctrl', '←']],
  pageForward: [[pageDown]],
  pageBack: [[pageUp]],
  bookmark: [['Alt', 'M']],
  index: [['Ctrl', 'B']],
  map: [['Shift', 'M']],
  // The view.
  zoomIn: [['Ctrl', '+']],
  zoomOut: [['Ctrl', '−']],
  resetZoom: [['Ctrl', '0']],
  seeAll: [['Shift', '1']],
  // The selection.
  selectAll: [['Ctrl', 'A']],
  duplicate: [['Ctrl', 'D']],
  delete: [[del]],
  edit: [['Enter']],
  nudge: [[arrows]],
  nudgeFar: [['Shift', arrowsLower]],
  group: [['Ctrl', 'G']],
  ungroup: [['Ctrl', 'Shift', 'G']],
  forward: [['Ctrl', '↑']],
  backward: [['Ctrl', '↓']],
  toFront: [['Ctrl', 'Shift', '↑']],
  toBack: [['Ctrl', 'Shift', '↓']],
  flipHorizontal: [['Shift', 'H']],
  flipVertical: [['Shift', 'V']],
  lock: [['Ctrl', 'Shift', 'L']],
  copyStyle: [['Ctrl', 'Alt', 'C']],
  pasteStyle: [['Ctrl', 'Alt', 'V']],
  copyAsImage: [['Shift', 'Alt', 'C']],
  deselect: [['Esc']],
  // In general.
  search: [
    ['Ctrl', 'K'],
    ['Ctrl', 'F'],
  ],
  sizeUp: [['+']],
  sizeDown: [['−']],
  undo: [['Ctrl', 'Z']],
  redo: [
    ['Ctrl', 'Shift', 'Z'],
    ['Ctrl', 'Y'],
  ],
  help: [['?']],
  settings: [['Ctrl', ',']],
  theme: [['Alt', 'Shift', 'D']],
} satisfies Record<string, Key[][]>;

export type ShortcutId = keyof typeof SHORTCUTS;

/** A shortcut's combinations, with the key names in the language of `t`. */
export function keysOf(id: ShortcutId, t: Messages): string[][] {
  return (SHORTCUTS[id] as Key[][]).map((combo) =>
    combo.map((key) => (typeof key === 'string' ? key : t.keys[key.name])),
  );
}
