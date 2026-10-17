import { describe, expect, it } from 'vitest';
// Pasting a font size measures the text again, on a canvas.
import './testCanvas';
import type { ArrowElement, NoteElement, StrokeElement, TextElement } from './elements';
import {
  copies,
  copyStyle,
  group,
  markPrivate,
  nudge,
  pasteStyle,
  toggleLock,
  ungroup,
  unlockAll,
} from './selectionEdits';

const base = { rotation: 0, opacity: 1, groupId: null, locked: false, x: 0, y: 0, z: 1 };

const stroke = (id: string, more: Partial<StrokeElement> = {}): StrokeElement => ({
  ...base,
  id,
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

const text = (id: string, more: Partial<TextElement> = {}): TextElement => ({
  ...base,
  id,
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

const note = (id: string, more: Partial<NoteElement> = {}): NoteElement => ({
  ...base,
  id,
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

const arrow = (id: string, from: string | null, to: string | null): ArrowElement => ({
  ...base,
  id,
  type: 'arrow',
  points: [0, 0, 0, 100, 0, 0],
  bend: 0,
  start: from ? { elementId: from, focus: { x: 0.5, y: 0.5 } } : null,
  end: to ? { elementId: to, focus: { x: 0.5, y: 0.5 } } : null,
  color: 'ink',
  size: 2,
  roughness: 1,
  seed: 1,
  startHead: 'none',
  endHead: 'arrow',
});

describe('grouping', () => {
  it('puts two or more unlocked elements in one new group', () => {
    const changes = group([stroke('a'), stroke('b'), stroke('c', { locked: true })])!;
    expect([...changes.keys()]).toEqual(['a', 'b']);
    const [a, b] = [...changes.values()];
    expect(a!.groupId).toBeTruthy();
    expect(b!.groupId).toBe(a!.groupId);
    expect(group([stroke('a'), stroke('c', { locked: true })])).toBeNull();
    // A hidden private note counts as locked.
    expect(group([stroke('a'), note('n', { private: true, concealed: true })])).toBeNull();
  });

  it('ungroups only what was in a group', () => {
    const changes = ungroup([stroke('a', { groupId: 'g' }), stroke('b')])!;
    expect([...changes.keys()]).toEqual(['a']);
    expect(changes.get('a')!.groupId).toBeNull();
    expect(ungroup([stroke('b')])).toBeNull();
  });
});

describe('marking notes private', () => {
  it('only notes that are not hidden, and back without the mark', () => {
    const hidden = note('h', { private: true, concealed: true });
    const on = markPrivate([note('n'), hidden, stroke('s'), undefined], true)!;
    expect([...on.keys()]).toEqual(['n']);
    expect(on.get('n')).toMatchObject({ private: true });
    const off = markPrivate([note('n', { private: true })], false)!;
    expect(off.get('n')).toMatchObject({ private: undefined });
    expect(markPrivate([hidden, stroke('s')], true)).toBeNull();
  });
});

describe('locking', () => {
  it('locks all if any was unlocked, unlocks if all were', () => {
    const lock = toggleLock([stroke('a'), stroke('b', { locked: true })])!;
    expect(lock.locked).toBe(true);
    expect([...lock.changes.values()].every((el) => el!.locked)).toBe(true);
    const unlock = toggleLock([stroke('a', { locked: true })])!;
    expect(unlock.locked).toBe(false);
    expect(unlock.changes.get('a')!.locked).toBe(false);
    expect(toggleLock([])).toBeNull();
  });

  it('unlocks every locked element and only those', () => {
    const changes = unlockAll([stroke('a', { locked: true }), stroke('b')])!;
    expect([...changes.keys()]).toEqual(['a']);
    expect(changes.get('a')!.locked).toBe(false);
    expect(unlockAll([stroke('b')])).toBeNull();
  });
});

describe('copying and pasting a style', () => {
  it("copies each type's own style, sizes as seen at the zoom", () => {
    expect(copyStyle(stroke('s', { size: 3, opacity: 0.5 }), 2)).toEqual({
      type: 'stroke',
      patch: { opacity: 0.5, color: 'ink', size: 6 },
    });
    expect(copyStyle(text('t', { italic: true }), 2)).toEqual({
      type: 'text',
      patch: {
        opacity: 1,
        color: 'ink',
        size: 40,
        font: 'inter',
        bold: false,
        italic: true,
        underline: false,
        align: 'left',
      },
    });
    expect(copyStyle(note('n', { variant: 'pin', valign: 'middle' }), 1).patch).toMatchObject({
      noteColor: 'yellow',
      noteVariant: 'pin',
      noteTextColor: null,
      size: 20,
      valign: 'middle',
    });
  });

  it('pastes the size only on the same type', () => {
    const copied = copyStyle(text('t', { color: 'red', fontSize: 30 }), 1);
    const changes = pasteStyle([text('u'), stroke('s')], copied, 1);
    expect(changes.get('u')).toMatchObject({ color: 'red', fontSize: 30 });
    expect(changes.get('s')).toMatchObject({ color: 'red', size: 4 });
  });

  it('pastes what is off too (a plain text takes the italic away)', () => {
    const copied = copyStyle(text('t'), 1);
    expect(pasteStyle([text('u', { italic: true })], copied, 1).get('u')).not.toMatchObject({
      italic: true,
    });
  });
});

describe('copies', () => {
  it('new ids, moved, on top in the same order, unlocked', () => {
    const made = copies(
      [stroke('b', { z: 7, locked: true }), stroke('a', { z: 2, x: 5 })],
      10,
      -3,
      20,
    );
    expect(made.map((el) => el.z)).toEqual([20, 21]);
    expect(made[0]).toMatchObject({ x: 15, y: -3, locked: false });
    expect(made[1]).toMatchObject({ x: 10, y: -3, locked: false });
    expect(made.map((el) => el.id)).not.toContain('a');
    expect(new Set(made.map((el) => el.id)).size).toBe(2);
  });

  it('each group copied becomes one new group of its own', () => {
    const made = copies(
      [
        stroke('a', { groupId: 'g' }),
        stroke('b', { groupId: 'g' }),
        stroke('c', { groupId: 'k' }),
        stroke('d'),
      ],
      0,
      0,
      1,
    );
    const [a, b, c, d] = made.map((el) => el.groupId);
    expect(a).toBeTruthy();
    expect(a).not.toBe('g');
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(d).toBeNull();
  });

  it('copied arrows point to the copies, or let go of what was not copied', () => {
    const [a, r] = copies([stroke('a', { z: 1 }), arrow('r', 'a', 'x')], 0, 0, 1);
    expect(r).toMatchObject({ start: { elementId: a.id, focus: { x: 0.5 } }, end: null });
  });
});

describe('nudging', () => {
  it('moves what is not locked; arrows let go of what stays', () => {
    const changes = nudge(
      [stroke('a'), stroke('b', { locked: true }), arrow('r', 'a', 'x')],
      4,
      2,
    )!;
    expect([...changes.keys()]).toEqual(['a', 'r']);
    expect(changes.get('a')).toMatchObject({ x: 4, y: 2 });
    expect(changes.get('r')).toMatchObject({ start: { elementId: 'a' }, end: null });
    expect(nudge([stroke('b', { locked: true })], 1, 0)).toBeNull();
  });
});
