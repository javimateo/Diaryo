import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/testBrowser';

vi.mock('./diaryActions', () => ({
  addPage: vi.fn(),
  goToToday: vi.fn(),
  toggleBookmark: vi.fn(),
  turnPage: vi.fn(() => Promise.resolve()),
}));
vi.mock('../desktop/bridge', () => ({ hideDesktop: vi.fn() }));

import type { Engine } from '../engine/engine';
import { useUI } from '../store/ui';
import { addPage, goToToday, toggleBookmark, turnPage } from './diaryActions';
import { SHORTCUTS, type ShortcutId } from './shortcuts';
import { handleShortcut } from './useShortcuts';

/** An engine that notes every call (and says it did something). */
function fakeEngine() {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (_, name: string) => {
      if (!calls.has(name)) {
        calls.set(
          name,
          vi.fn(() => (name === 'copySelectionAsPng' ? Promise.resolve(false) : true)),
        );
      }
      return calls.get(name);
    },
  });
}

/** The store's actions the shortcuts use, noted. */
const actions = () => ({
  setHelpOpen: vi.fn(),
  setSettingsOpen: vi.fn(),
  setPaletteOpen: vi.fn(),
  setDiaryOpen: vi.fn(),
  setMapOpen: vi.fn(),
  setToolStyle: vi.fn(),
  setTool: vi.fn(),
  toggleTheme: vi.fn(),
  showToast: vi.fn(),
});

/** The key a shortcut's key stands for (as `KeyboardEvent.key` and `code`). */
const NAMED: Record<string, string> = {
  Esc: 'Escape',
  Enter: 'Enter',
  '→': 'ArrowRight',
  '←': 'ArrowLeft',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '−': '-',
  home: 'Home',
  delete: 'Delete',
  pageUp: 'PageUp',
  pageDown: 'PageDown',
  arrows: 'ArrowRight',
  arrowsLower: 'ArrowRight',
};

/** The event of pressing a combination of the table. */
function press(combo: (string | { name: string })[]) {
  const names = combo.map((key) => (typeof key === 'string' ? key : key.name));
  const main = names.find((name) => !['Ctrl', 'Shift', 'Alt'].includes(name))!;
  const key = NAMED[main] ?? (main.length === 1 ? main.toLowerCase() : main);
  const code = /^[A-Z]$/.test(main) ? `Key${main}` : /^\d$/.test(main) ? `Digit${main}` : key;
  return {
    key,
    code,
    ctrlKey: names.includes('Ctrl'),
    shiftKey: names.includes('Shift'),
    altKey: names.includes('Alt'),
    metaKey: false,
    repeat: false,
    target: null,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}

let engine: ReturnType<typeof fakeEngine>;
let ui: ReturnType<typeof actions>;

beforeEach(() => {
  vi.clearAllMocks();
  engine = fakeEngine();
  ui = actions();
  const state = useUI.getState();
  useUI.setState({
    ...ui,
    engine: engine as unknown as Engine,
    editing: null,
    settingsOpen: false,
    helpOpen: false,
    paletteOpen: false,
    diaryOpen: false,
    mapOpen: false,
    upcomingOpen: false,
    desktop: null,
    tool: 'pen',
    doc: { ...state.doc, selectionCount: 1, selectionStyle: null },
  });
});

/** What each shortcut must do. */
const does: Record<ShortcutId, () => void> = {
  today: () => expect(goToToday).toHaveBeenCalled(),
  newPage: () => expect(addPage).toHaveBeenCalled(),
  turnForward: () => expect(turnPage).toHaveBeenCalledWith(1),
  turnBack: () => expect(turnPage).toHaveBeenCalledWith(-1),
  pageForward: () => expect(turnPage).toHaveBeenCalledWith(1),
  pageBack: () => expect(turnPage).toHaveBeenCalledWith(-1),
  bookmark: () => expect(toggleBookmark).toHaveBeenCalled(),
  index: () => expect(ui.setDiaryOpen).toHaveBeenCalledWith(true),
  map: () => expect(ui.setMapOpen).toHaveBeenCalledWith(true),
  zoomIn: () => expect(engine.zoomIn).toHaveBeenCalled(),
  zoomOut: () => expect(engine.zoomOut).toHaveBeenCalled(),
  resetZoom: () => expect(engine.resetZoom).toHaveBeenCalled(),
  seeAll: () => expect(engine.zoomToFit).toHaveBeenCalled(),
  selectAll: () => expect(engine.selectAll).toHaveBeenCalled(),
  duplicate: () => expect(engine.duplicateSelection).toHaveBeenCalled(),
  delete: () => expect(engine.deleteSelection).toHaveBeenCalled(),
  edit: () => expect(engine.editSelection).toHaveBeenCalled(),
  nudge: () => expect(engine.nudgeSelection).toHaveBeenCalledWith(1, 0),
  nudgeFar: () => expect(engine.nudgeSelection).toHaveBeenCalledWith(10, 0),
  group: () => expect(engine.groupSelection).toHaveBeenCalled(),
  ungroup: () => expect(engine.ungroupSelection).toHaveBeenCalled(),
  forward: () => expect(engine.arrangeSelection).toHaveBeenCalledWith('forward'),
  backward: () => expect(engine.arrangeSelection).toHaveBeenCalledWith('backward'),
  toFront: () => expect(engine.arrangeSelection).toHaveBeenCalledWith('front'),
  toBack: () => expect(engine.arrangeSelection).toHaveBeenCalledWith('back'),
  flipHorizontal: () => expect(engine.flipSelection).toHaveBeenCalledWith('horizontal'),
  flipVertical: () => expect(engine.flipSelection).toHaveBeenCalledWith('vertical'),
  lock: () => expect(engine.toggleLockSelection).toHaveBeenCalled(),
  copyStyle: () => expect(engine.copyStyle).toHaveBeenCalled(),
  pasteStyle: () => expect(engine.pasteStyle).toHaveBeenCalled(),
  copyAsImage: () => expect(engine.copySelectionAsPng).toHaveBeenCalled(),
  deselect: () => expect(engine.clearSelection).toHaveBeenCalled(),
  search: () => expect(ui.setPaletteOpen).toHaveBeenCalledWith(true),
  sizeUp: () => {
    const [tool, style] = ui.setToolStyle.mock.calls[0];
    expect(tool).toBe('pen');
    expect(style.size).toBeGreaterThan(useUI.getState().styles.pen.size);
  },
  sizeDown: () => {
    const [tool, style] = ui.setToolStyle.mock.calls[0];
    expect(tool).toBe('pen');
    expect(style.size).toBeLessThan(useUI.getState().styles.pen.size);
  },
  undo: () => expect(engine.undo).toHaveBeenCalled(),
  redo: () => expect(engine.redo).toHaveBeenCalled(),
  help: () => expect(ui.setHelpOpen).toHaveBeenCalledWith(true, 'shortcuts'),
  settings: () => expect(ui.setSettingsOpen).toHaveBeenCalledWith(true),
  theme: () => expect(ui.toggleTheme).toHaveBeenCalled(),
};

describe('every keyboard shortcut of the table does what it says', () => {
  const cases = Object.entries(SHORTCUTS).flatMap(([id, combos]) =>
    combos.map((combo) => [
      `${id}: ${combo.map((k) => (typeof k === 'string' ? k : k.name)).join('+')}`,
      id as ShortcutId,
      combo,
    ]),
  ) as [string, ShortcutId, (string | { name: string })[]][];

  it.each(cases)('%s', (_, id, combo) => {
    handleShortcut(press(combo));
    does[id]();
  });
});
