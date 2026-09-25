import { describe, expect, it } from 'vitest';
import { belongsToDesk, type Desk } from './autosave';

const desk = (): Desk => ({ ids: new Set(['nota']), onPage: new Map([['nota', false]]) });

describe('desk or page', () => {
  it('new things belong where they end up', () => {
    const d = desk();
    expect(belongsToDesk(d, 'nuevo', false)).toBe(true);
    expect(belongsToDesk(d, 'otro', true)).toBe(false);
  });

  it('desk things stay on the desk even where the book opens', () => {
    // Placed there from the desktop: it was already inside last time.
    const d: Desk = { ids: new Set(['nota']), onPage: new Map([['nota', true]]) };
    expect(belongsToDesk(d, 'nota', true)).toBe(true);
  });

  it('crossing the edge of the book changes where it belongs', () => {
    const d = desk();
    expect(belongsToDesk(d, 'nota', true)).toBe(false);
    // Already on the page: if it leaves again, it goes back to the desk.
    d.ids.delete('nota');
    expect(belongsToDesk(d, 'nota', true)).toBe(false);
    expect(belongsToDesk(d, 'nota', false)).toBe(true);
  });
});
