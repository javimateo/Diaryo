import { beforeEach, describe, expect, it } from 'vitest';
import { drawnTexts, testCanvases } from './testCanvas';
import { DEFAULT_BOOK_STYLE, type BookSpread } from './book';
import { Engine, type EngineState } from './engine';
import type {
  ArrowElement,
  NoteElement,
  SceneElement,
  StrokeElement,
  TextElement,
} from './elements';

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

/** An arrow from one element to another (null: a loose end). */
const arrow = (id: string, z: number, from: string | null, to: string | null): ArrowElement => ({
  ...base,
  id,
  z,
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

let engine: Engine;
let state: EngineState;
const get = (id: string) => engine.allElements().find((el) => el.id === id)!;
/** Selects these elements (as a click would: the engine has no public way to). */
const select = (...ids: string[]) =>
  (engine as unknown as { setSelection(ids: string[]): void }).setSelection(ids);
const selected = () => [...(engine as unknown as { selection: Set<string> }).selection];
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

describe('copying and selecting through the engine', () => {
  it('selecting one of a group selects the group, never a hidden private note', () => {
    load(
      stroke('a', 1, { groupId: 'g' }),
      stroke('b', 2, { groupId: 'g' }),
      note('h', 3, { groupId: 'g', private: true, concealed: true }),
      stroke('c', 4),
    );
    select('a');
    expect(selected().sort()).toEqual(['a', 'b']);
    select('h', 'c');
    expect(selected()).toEqual(['c']);
  });

  it('duplicates on top, in a new group, with the arrows on the copies', () => {
    load(
      stroke('a', 5, { groupId: 'g', x: 10 }),
      arrow('r', 6, 'a', 'c'),
      arrow('q', 7, 'c', 'a'),
      stroke('c', 9),
      stroke('d', 3, { groupId: 'g', locked: true }),
    );
    select('a', 'r', 'q', 'd');
    expect(engine.duplicateSelection()).toBe(true);
    const copies = engine.allElements().filter((el) => !['a', 'r', 'q', 'c', 'd'].includes(el.id));
    expect(copies.map((el) => el.z)).toEqual([10, 11, 12, 13]);
    const [d, a, r, q] = copies.sort((x, y) => x.z - y.z);
    expect(a).toMatchObject({ type: 'stroke', x: 18, y: 8, locked: false });
    expect(d).toMatchObject({ locked: false });
    expect(a.groupId).toBeTruthy();
    expect(a.groupId).not.toBe('g');
    expect(d.groupId).toBe(a.groupId);
    expect(r).toMatchObject({ groupId: null, start: { elementId: a.id }, end: null });
    expect(q).toMatchObject({ start: null, end: { elementId: a.id } });
    expect(selected().sort()).toEqual(copies.map((el) => el.id).sort());
    engine.undo();
    expect(engine.allElements()).toHaveLength(5);
  });

  it('pastes what was copied as new elements', () => {
    load(stroke('a', 1), stroke('b', 2));
    select('a', 'b');
    const copied = engine.copySelection()!;
    expect(engine.paste(copied)).toBe(true);
    expect(engine.allElements()).toHaveLength(4);
    expect(selected()).toHaveLength(2);
    expect(selected()).not.toContain('a');
  });

  it('nudges what is not locked, and loose arrows let go', () => {
    load(stroke('a', 1), stroke('b', 2, { locked: true }), arrow('r', 3, 'a', 'c'), stroke('c', 4));
    select('a', 'b', 'r');
    expect(engine.nudgeSelection(10, -4)).toBe(true);
    expect(get('a')).toMatchObject({ x: 5, y: -2 });
    expect(get('b')).toMatchObject({ x: 0, y: 0 });
    expect(get('r')).toMatchObject({ x: 5, start: { elementId: 'a' }, end: null });
    select('b');
    expect(engine.nudgeSelection(1, 0)).toBe(false);
  });
});

describe("the page's images never show a private note's text", () => {
  const book: BookSpread = {
    style: DEFAULT_BOOK_STYLE,
    date: '',
    title: '',
    today: false,
    pageNumber: 1,
    tabs: [],
    labels: { today: '', cues: '', notes: '', summary: '', tasks: '' },
  };
  const secret = () => note('p', 1, { private: true, text: 'pin 4321', x: 20, y: -100 });
  const plain = () => note('n', 2, { text: 'hola', x: 20, y: 150 });
  /** What was drawn while making an image. */
  const drawing = (make: () => unknown) => {
    drawnTexts.length = 0;
    const image = make();
    return { image, texts: drawnTexts.join(' ') };
  };

  it('the thumbnail of a loose page, of an open diary and of a closed one', () => {
    load(secret(), plain());
    for (const spread of [null, book, { ...book, closed: true }]) {
      engine.setBook(spread);
      const { image, texts } = drawing(() => engine.thumbnail(200, 150));
      expect(image).toEqual(expect.any(String));
      expect(texts).toContain('hola');
      expect(texts).not.toContain('4321');
    }
  });

  it('an empty page has no thumbnail, except the closed diary (its cover)', () => {
    load();
    expect(engine.thumbnail(200, 150)).toBeNull();
    engine.setBook(book);
    expect(engine.thumbnail(200, 150)).toBeNull();
    engine.setBook({ ...book, closed: true });
    expect(engine.thumbnail(200, 150)).toEqual(expect.any(String));
  });

  it("another page's thumbnail and the cover image", () => {
    const elements = [secret(), plain()];
    const spread = drawing(() => engine.spreadThumbnail({ id: 'x', elements, book }, 200));
    const cover = drawing(() => engine.coverImage(book, elements, 200));
    for (const { image, texts } of [spread, cover]) {
      expect(image).toEqual(expect.any(String));
      expect(texts).toContain('hola');
      expect(texts).not.toContain('4321');
    }
  });

  it('while the open page itself still shows it', () => {
    load(secret());
    expect(get('p')).toMatchObject({ text: 'pin 4321' });
  });
});
