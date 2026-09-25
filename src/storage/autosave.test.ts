import { describe, expect, it } from 'vitest';
import { belongsToDesk, type Desk } from './autosave';

const desk = (): Desk => ({ ids: new Set(['nota']), onPage: new Map([['nota', false]]) });

describe('mesa o página', () => {
  it('lo nuevo es de donde queda', () => {
    const d = desk();
    expect(belongsToDesk(d, 'nuevo', false)).toBe(true);
    expect(belongsToDesk(d, 'otro', true)).toBe(false);
  });

  it('lo de la mesa sigue siendo de la mesa aunque esté donde se abre el libro', () => {
    // Puesto ahí desde el escritorio: ya estaba dentro la última vez.
    const d: Desk = { ids: new Set(['nota']), onPage: new Map([['nota', true]]) };
    expect(belongsToDesk(d, 'nota', true)).toBe(true);
  });

  it('al cruzar el borde del libro cambia de sitio', () => {
    const d = desk();
    expect(belongsToDesk(d, 'nota', true)).toBe(false);
    // Ya en la página: si sale otra vez, vuelve a la mesa.
    d.ids.delete('nota');
    expect(belongsToDesk(d, 'nota', true)).toBe(false);
    expect(belongsToDesk(d, 'nota', false)).toBe(true);
  });
});
