import { beforeEach, describe, expect, it } from 'vitest';
import { testCanvases } from './testCanvas';
import { Engine, type EngineState } from './engine';
import type { NoteElement, SceneElement, StrokeElement, TextElement } from './elements';

const base = { rotation: 0, opacity: 1, groupId: null, locked: false, x: 0, y: 0 };

const stroke = (id: string, z: number, more: Partial<StrokeElement> = {}): StrokeElement => ({
  ...base,
  id,
  z,
  type: 'stroke',
  kind: 'pen',
  points: [0, 0, 0.5, 100, 0, 0.5],
  simulatePressure: true,
  color: 'ink',
  size: 4,
  fill: null,
  fillStyle: 'solid',
  label: null,
  ...more,
});

const text = (id: string, z: number, more: Partial<TextElement> = {}): TextElement => ({
  ...base,
  id,
  z,
  type: 'text',
  text: 'hola',
  fontSize: 20,
  color: 'ink',
  font: 'inter',
  align: 'left',
  wrap: false,
  width: 40,
  height: 24,
  ...more,
});

const note = (id: string, z: number, more: Partial<NoteElement> = {}): NoteElement => ({
  ...base,
  id,
  z,
  type: 'note',
  variant: 'plain',
  text: 'nota',
  fontSize: 20,
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
  width: 220,
  height: 220,
  ...more,
});

let engine: Engine;
let state: EngineState;
const get = (id: string) => engine.allElements().find((el) => el.id === id)!;
/** Selects these elements (as a click would: the engine has no public way to). */
const select = (...ids: string[]) =>
  (engine as unknown as { setSelection(ids: string[]): void }).setSelection(ids);
const load = (...elements: SceneElement[]) => engine.loadPage(elements, { x: 0, y: 0, zoom: 2 });

beforeEach(() => {
  engine = new Engine(testCanvases());
  engine.subscribeState((next) => (state = next));
});

describe('editing the selection through the engine', () => {
  it('groups what is not locked (two or more), ungroups, and undo brings it back', () => {
    load(stroke('a', 1), stroke('b', 2), stroke('c', 3, { locked: true }));
    select('a');
    expect(engine.groupSelection()).toBe(false);
    select('a', 'b', 'c');
    expect(engine.groupSelection()).toBe(true);
    const groupId = get('a').groupId;
    expect(groupId).toBeTruthy();
    expect(get('b').groupId).toBe(groupId);
    expect(get('c').groupId).toBeNull();
    expect(state.selectionGrouped).toBe(true);

    expect(engine.ungroupSelection()).toBe(true);
    expect(get('a').groupId).toBeNull();
    expect(engine.ungroupSelection()).toBe(false);
    engine.undo();
    expect(get('b').groupId).toBe(groupId);
    engine.undo();
    expect(get('a').groupId).toBeNull();
  });

  it('locks the selection (and lets go of it), unlocks if all were, and unlocks all', () => {
    load(stroke('a', 1), stroke('b', 2, { locked: true }), stroke('c', 3));
    select('a', 'b');
    expect(engine.toggleLockSelection()).toBe(true);
    expect([get('a').locked, get('b').locked, get('c').locked]).toEqual([true, true, false]);
    expect(state.selectionCount).toBe(0);

    select('a', 'b');
    expect(engine.toggleLockSelection()).toBe(true);
    expect([get('a').locked, get('b').locked]).toEqual([false, false]);
    expect(state.selectionCount).toBe(2);

    engine.undo();
    engine.clearSelection();
    expect(engine.toggleLockSelection()).toBe(false);
    expect(engine.unlockAll()).toBe(true);
    expect(engine.allElements().some((el) => el.locked)).toBe(false);
    expect(state.selectionCount).toBe(2);
    expect(engine.unlockAll()).toBe(false);
  });

  it('marks notes private and back, never a hidden one nor what is not a note', () => {
    load(note('n', 1), note('h', 2, { private: true, concealed: true }), stroke('s', 3));
    expect(engine.setPrivate(['s', 'h'], true)).toBe(false);
    expect(engine.setPrivate(['n', 'h', 's'], true)).toBe(true);
    expect(get('n')).toMatchObject({ private: true });
    expect(engine.setPrivate(['n'], false)).toBe(true);
    expect(get('n')).toMatchObject({ private: undefined });
    expect('private' in get('n')).toBe(true);
    engine.undo();
    expect(get('n')).toMatchObject({ private: true });
  });

  it('copies the style of the first selected and pastes it (no size on other types)', () => {
    const t = text('t', 1, { color: 'red', fontSize: 30, font: 'serif', bold: true, opacity: 0.5 });
    load(t, text('u', 2), stroke('s', 3), note('n', 4));
    engine.clearSelection();
    expect(engine.copyStyle()).toBe(false);
    expect(engine.pasteStyle()).toBe(false);

    select('t', 's');
    expect(engine.copyStyle()).toBe(true);
    expect(state.hasCopiedStyle).toBe(true);
    engine.clearSelection();
    expect(engine.pasteStyle()).toBe(false);

    select('u', 's', 'n');
    expect(engine.pasteStyle()).toBe(true);
    expect(get('u')).toMatchObject({
      color: 'red',
      fontSize: 30,
      font: 'serif',
      bold: true,
      italic: undefined,
      opacity: 0.5,
    });
    expect(get('s')).toMatchObject({ color: 'red', size: 4, opacity: 0.5 });
    expect(get('n')).toMatchObject({ fontSize: 20, font: 'serif', bold: true, opacity: 0.5 });
    engine.undo();
    expect(get('u')).toMatchObject({ color: 'ink', fontSize: 20, opacity: 1 });
  });

  it("copies a note's own style and a stroke's width, at the zoom they are seen", () => {
    const n = note('n', 1, { color: 'blue', variant: 'pin', textColor: 'red', valign: 'middle' });
    load(n, note('m', 2), stroke('s', 3, { size: 6 }), stroke('r', 4));
    select('n');
    engine.copyStyle();
    select('m');
    engine.pasteStyle();
    expect(get('m')).toMatchObject({
      color: 'blue',
      variant: 'pin',
      textColor: 'red',
      valign: 'middle',
    });
    select('s');
    engine.copyStyle();
    select('r');
    engine.pasteStyle();
    expect(get('r')).toMatchObject({ size: 6 });
  });
});
