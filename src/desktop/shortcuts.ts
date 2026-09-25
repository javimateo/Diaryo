/** Atajos de teclado de la app de escritorio (funciones puras, sin nada de Tauri). */

const KEY_NAMES: Record<string, string> = { Space: 'Espacio' };

/** Cómo se enseña cada tecla de un atajo ("Ctrl+Alt+D" → Ctrl, Alt, D). */
export const shortcutKeys = (shortcut: string) =>
  shortcut.split('+').map((key) => KEY_NAMES[key] ?? key);

/**
 * El atajo de una pulsación de teclado ("Ctrl+Alt+D"), o null si aún no vale: tiene
 * que llevar Ctrl o Alt (si no, taparía teclas normales) y una letra, un número, una
 * tecla de función o el espacio.
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

/** Lo que hace cada tecla en la mesa del escritorio (nada de lo del diario). */
export type DeskKeyAction = 'undo' | 'redo' | 'delete' | 'edit' | 'deselect' | 'ignore' | null;

/**
 * La tecla pulsada en la mesa del escritorio: deshacer, rehacer, borrar, editar o soltar
 * la selección. `ignore`: se come la tecla (el espacio, que movería la vista, y los
 * atajos del diario); null: la tecla sigue su camino (se está escribiendo).
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
