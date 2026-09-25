import { X } from 'lucide-react';
import { shortcutKeys } from '../desktop/shortcuts';
import type { DesktopInfo } from '../desktop/settings';
import type { Messages } from '../i18n';
import { useUI } from '../store/ui';
import { TOOLS } from './toolDefs';
import { useT } from './useT';

/** A shortcut: what it does and its combinations (any of them works). */
type Shortcut = [string, string[][]];

/** The shortcut lists, with the texts and key names of the active language. */
function shortcutLists(t: Messages, desktop: DesktopInfo | null) {
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

export function HelpDialog() {
  const t = useT();
  const open = useUI((s) => s.helpOpen);
  const setOpen = useUI((s) => s.setHelpOpen);
  const desktop = useUI((s) => s.desktop);
  if (!open) return null;
  const lists = shortcutLists(t, desktop);

  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="help-title">{t.help.title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.common.close}
            onClick={() => setOpen(false)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="dialog-body" data-scrollable>
          <section>
            <h3>{t.help.tools}</h3>
            <ul className="shortcut-list">
              {TOOLS.map((tool) => (
                <li key={tool.id}>
                  <span>{t.tools.names[tool.id]}</span>
                  <Combos
                    combos={
                      tool.digit
                        ? [[tool.key.toUpperCase()], [tool.digit]]
                        : [[tool.key.toUpperCase()]]
                    }
                  />
                </li>
              ))}
            </ul>
            <h3>{t.help.writing}</h3>
            <ShortcutList items={lists.writing} />
            <h3>{t.help.navigation}</h3>
            <ShortcutList items={lists.navigation} />
            <h3>{t.help.diary}</h3>
            <ShortcutList items={lists.diary} />
          </section>
          <section>
            <h3>{t.help.selection}</h3>
            <ShortcutList items={lists.selection} />
            <h3>{t.help.general}</h3>
            <ShortcutList items={lists.general} />
          </section>
        </div>
      </div>
    </div>
  );
}

function ShortcutList({ items }: { items: Shortcut[] }) {
  return (
    <ul className="shortcut-list">
      {items.map(([label, combos]) => (
        <li key={label}>
          <span>{label}</span>
          <Combos combos={combos} />
        </li>
      ))}
    </ul>
  );
}

function Combos({ combos }: { combos: string[][] }) {
  const t = useT();
  return (
    <span className="combos">
      {combos.map((combo, i) => (
        <span key={i} className="combo">
          {i > 0 && <span className="combo-or">{t.help.or}</span>}
          {combo.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
