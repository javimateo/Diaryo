import { describe, expect, it } from 'vitest';
import { drawn, dropped, progress, shown, typed } from './clips';
import type { NoteElement, StrokeElement } from './elements';

const base = {
  z: 1,
  x: 100,
  y: 200,
  rotation: 0.1,
  opacity: 1,
  groupId: null,
  locked: false,
};

const stroke: StrokeElement = {
  ...base,
  id: 'stroke',
  type: 'stroke',
  kind: 'pen',
  points: Array.from({ length: 10 }, (_, i) => [i * 10, 0, 0.5]).flat(),
  simulatePressure: false,
  color: 'ink',
  size: 4,
  fill: null,
  fillStyle: 'hachure',
  label: null,
};

const note: NoteElement = {
  ...base,
  id: 'note',
  type: 'note',
  variant: 'tape',
  text: '[ ] Pan',
  fontSize: 36,
  color: 'yellow',
  textColor: null,
  font: 'caveat',
  align: 'left',
  valign: 'top',
  width: 200,
  height: 200,
};

describe('progress', () => {
  it('is 0 before its start, 1 after its end and grows between', () => {
    expect(progress(0, 100, 200)).toBe(0);
    expect(progress(200, 100, 200)).toBe(0.5);
    expect(progress(400, 100, 200)).toBe(1);
  });
});

describe('drawn', () => {
  it('draws the stroke from its first point', () => {
    expect(drawn(stroke, 0)).toBeNull();
    expect(drawn(stroke, 0.5)?.points).toEqual(stroke.points.slice(0, 15));
    // Whole, it is the same element (nothing to redraw).
    expect(drawn(stroke, 1)).toBe(stroke);
  });
});

describe('typed', () => {
  it('writes letter by letter, keeping the first ones', () => {
    expect(typed(note, 0)).toBeNull();
    expect(typed(note, 0, 4)?.text).toBe('[ ] ');
    expect(typed(note, 0.34, 4)?.text).toBe('[ ] P');
    expect(typed(note, 1)).toBe(note);
  });

  it('counts letters, not code units', () => {
    expect(typed({ ...note, text: 'año 🌱' }, 0.99)?.text).toBe('año 🌱');
    expect(typed({ ...note, text: '🌱🌱' }, 0.5)?.text).toBe('🌱');
  });
});

describe('dropped', () => {
  it('falls into its place', () => {
    expect(dropped(note, 0)).toBeNull();
    const falling = dropped(note, 0.5)!;
    expect(falling.y).toBeLessThan(note.y);
    expect(falling.x).toBe(note.x);
    expect(dropped(note, 1)).toBe(note);
  });
});

describe('shown', () => {
  it('leaves out what has not started', () => {
    expect(shown(note, null, stroke)).toEqual([note, stroke]);
  });
});
