/** Keyboard shortcuts of the desktop app (pure functions, nothing from Tauri). */

/** How each key of a shortcut is shown ("Ctrl+Alt+D" → Ctrl, Alt, D). */
export const shortcutKeys = (shortcut: string, spaceName = 'Space') =>
  shortcut.split('+').map((key) => (key === 'Space' ? spaceName : key));

/**
 * The shortcut of a key press ("Ctrl+Alt+D"), or null if it isn't valid yet: it must
 * include Ctrl or Alt (otherwise it would hide normal keys) and a letter, a number, a
 * function key or space.
 */
export function shortcutFromEvent(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): string | null {
  const key = /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3)
    : /^Digit\d$/.test(e.code)
      ? e.code.slice(5)
      : /^F\d{1,2}$/.test(e.code) || e.code === 'Space'
        ? e.code
        : null;
  if (!key || (!e.ctrlKey && !e.altKey)) return null;
  const modifiers = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'];
  return [...modifiers.filter(Boolean), key].join('+');
}

/** What each key does on the desktop desk (nothing from the diary). */
export type DeskKeyAction = 'undo' | 'redo' | 'delete' | 'edit' | 'deselect' | 'ignore' | null;

/**
 * The key pressed on the desktop desk: undo, redo, delete, edit or release the selection.
 * `ignore`: the key is swallowed (space, which would move the view, and the diary
 * shortcuts); null: the key goes on (you are typing).
 */
export function deskKeyAction(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): DeskKeyAction {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && key === 'z' && !e.shiftKey) return 'undo';
  if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) return 'redo';
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete';
  if (e.key === 'Enter') return 'edit';
  if (e.key === 'Escape') return 'deselect';
  return e.key === ' ' || mod ? 'ignore' : null;
}
