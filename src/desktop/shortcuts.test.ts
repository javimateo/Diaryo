import { describe, expect, it } from 'vitest';
import { deskKeyAction, shortcutFromEvent, shortcutKeys } from './shortcuts';

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey', boolean>>) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('global shortcuts', () => {
  it('reads the pressed combination', () => {
    expect(shortcutFromEvent(key('KeyD', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+D');
    expect(shortcutFromEvent(key('Digit5', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+5');
    expect(shortcutFromEvent(key('Space', { ctrlKey: true }))).toBe('Ctrl+Space');
  });

  it("without Ctrl or Alt, or with an odd key, it isn't valid yet", () => {
    expect(shortcutFromEvent(key('KeyD', { shiftKey: true }))).toBeNull();
    expect(shortcutFromEvent(key('ControlLeft', { ctrlKey: true }))).toBeNull();
  });

  it('shows each key separately', () => {
    expect(shortcutKeys('Ctrl+Space', 'Espacio')).toEqual(['Ctrl', 'Espacio']);
  });
});

describe('keys on the desktop desk', () => {
  const press = (k: string, mods: Partial<Record<'ctrlKey' | 'shiftKey', boolean>> = {}) =>
    deskKeyAction({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it('undo, redo, delete, edit and release', () => {
    expect(press('z', { ctrlKey: true })).toBe('undo');
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(press('y', { ctrlKey: true })).toBe('redo');
    expect(press('Delete')).toBe('delete');
    expect(press('Enter')).toBe('edit');
    expect(press('Escape')).toBe('deselect');
  });

  it('space and the diary shortcuts do nothing; the rest goes on', () => {
    expect(press(' ')).toBe('ignore');
    expect(press('k', { ctrlKey: true })).toBe('ignore');
    expect(press('a')).toBeNull();
  });
});
