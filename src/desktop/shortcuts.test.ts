import { describe, expect, it } from 'vitest';
import { deskKeyAction, shortcutFromEvent, shortcutKeys } from './shortcuts';

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey', boolean>>) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('atajos globales', () => {
  it('lee la combinación pulsada', () => {
    expect(shortcutFromEvent(key('KeyD', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+D');
    expect(shortcutFromEvent(key('Digit5', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+5');
    expect(shortcutFromEvent(key('Space', { ctrlKey: true }))).toBe('Ctrl+Space');
  });

  it('sin Ctrl ni Alt, o con una tecla rara, aún no vale', () => {
    expect(shortcutFromEvent(key('KeyD', { shiftKey: true }))).toBeNull();
    expect(shortcutFromEvent(key('ControlLeft', { ctrlKey: true }))).toBeNull();
  });

  it('enseña cada tecla por separado', () => {
    expect(shortcutKeys('Ctrl+Space')).toEqual(['Ctrl', 'Espacio']);
  });
});

describe('teclas en la mesa del escritorio', () => {
  const press = (k: string, mods: Partial<Record<'ctrlKey' | 'shiftKey', boolean>> = {}) =>
    deskKeyAction({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it('deshacer, rehacer, borrar, editar y soltar', () => {
    expect(press('z', { ctrlKey: true })).toBe('undo');
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(press('y', { ctrlKey: true })).toBe('redo');
    expect(press('Delete')).toBe('delete');
    expect(press('Enter')).toBe('edit');
    expect(press('Escape')).toBe('deselect');
  });

  it('el espacio y los atajos del diario no hacen nada; lo demás sigue su camino', () => {
    expect(press(' ')).toBe('ignore');
    expect(press('k', { ctrlKey: true })).toBe('ignore');
    expect(press('a')).toBeNull();
  });
});
