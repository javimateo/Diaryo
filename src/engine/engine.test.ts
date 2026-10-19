import { beforeEach, describe, expect, it } from 'vitest';
import { drawnTexts, testCanvases } from './testCanvas';
import { DEFAULT_BOOK_STYLE, type BookSpread } from './book';
import { Engine, type EngineState } from './engine';
import { privateBadge } from './elements';
import { linkBadges } from './links';
import { taskAt } from './tasks';
import type { TextDates } from './text';
import type { EditingState } from './types';
import type {
  ArrowElement,
  NoteElement,
  SceneElement,
  ShapeElement,
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

const shape = (id: string, z: number, more: Partial<ShapeElement> = {}): ShapeElement => ({
  ...base,
  id,
  z,
  type: 'shape',
  shape: 'rect',
  color: 'ink',
  border: true,
  strokeWidth: 2,
  roughness: 1,
  seed: 1,
  fill: null,
  fillStyle: 'solid',
  label: null,
  width: 200,
  height: 100,
  ...more,
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

describe('writing in a text, a note or a shape', () => {
  let editing: EditingState | null = null;
  beforeEach(() => {
    engine.subscribeEditing((next) => (editing = next));
  });
  /** Edits the only element selected, writes this and finishes. */
  const write = (id: string, text: string) => {
    select(id);
    expect(engine.editSelection()).toBe(true);
    engine.updateEditingText(text);
    engine.finishEditing();
  };

  it('keeps what was written, selects it, and undo brings the old text back', () => {
    load(text('t', 1), stroke('s', 2));
    select('t');
    engine.editSelection();
    expect(editing).toMatchObject({ isNew: false, element: { id: 't' } });
    expect(state.selectionCount).toBe(0);
    engine.updateEditingText('adiós');
    expect(get('t')).toMatchObject({ text: 'hola' });
    engine.finishEditing();
    expect(editing).toBeNull();
    expect(get('t')).toMatchObject({ text: 'adiós' });
    expect(selected()).toEqual(['t']);
    engine.undo();
    expect(get('t')).toMatchObject({ text: 'hola' });
  });

  it('only edits one editable element', () => {
    load(text('t', 1), text('u', 2), stroke('s', 3));
    select('t', 'u');
    expect(engine.editSelection()).toBe(false);
    select('s');
    expect(engine.editSelection()).toBe(false);
  });

  it('an emptied text is deleted (and undo brings it back); an empty note stays', () => {
    load(text('t', 1), note('n', 2));
    write('t', '   ');
    expect(engine.allElements().map((el) => el.id)).toEqual(['n']);
    expect(selected()).toEqual([]);
    engine.undo();
    expect(get('t')).toMatchObject({ text: 'hola' });
    write('n', '');
    expect(get('n')).toMatchObject({ text: '' });
  });

  it('leaves no step to undo when nothing changed', () => {
    load(text('t', 1));
    select('t');
    engine.editSelection();
    engine.finishEditing();
    expect(state.canUndo).toBe(false);
    expect(selected()).toEqual(['t']);
  });

  it('a shape gets an empty label to write in, and loses it if left empty', () => {
    load(shape('r', 1));
    select('r');
    engine.editSelection();
    expect(editing?.element).toMatchObject({ label: { text: '' } });
    engine.finishEditing();
    expect(get('r')).toMatchObject({ label: null });
    expect(state.canUndo).toBe(false);
    write('r', 'caja');
    expect(get('r')).toMatchObject({ label: { text: 'caja' } });
  });

  it('writes the dates in full when it ends', () => {
    engine.setDates({
      today: '2026-10-17',
      monthFirst: false,
      label: () => ({ text: 'mañana', tone: 'soon' }),
      complete: (text: string) => text.replace('@mañana', '@18/10/2026'),
    } as unknown as TextDates);
    load(text('t', 1));
    write('t', 'cita @mañana');
    expect(get('t')).toMatchObject({ text: 'cita @18/10/2026' });
    engine.setDates(null);
  });

  it('while written, a date takes the room of what is written; then, of its label', () => {
    engine.setDates({
      today: '2026-10-17',
      monthFirst: false,
      label: () => ({ text: 'una etiqueta mucho más larga que la fecha', tone: 'soon' }),
      complete: (text: string) => text,
    } as unknown as TextDates);
    load(text('t', 1, { text: 'cita @mañana' }));
    select('t');
    engine.editSelection();
    const width = (el: unknown) => (el as TextElement).width;
    const writing = width(editing!.element);
    engine.finishEditing();
    expect(width(get('t'))).toBeGreaterThan(writing * 2);
    engine.setDates(null);
  });

  it('finishing without selecting leaves the selection alone', () => {
    load(text('t', 1));
    select('t');
    engine.editSelection();
    engine.updateEditingText('otra');
    engine.finishEditing(false);
    expect(get('t')).toMatchObject({ text: 'otra' });
    expect(selected()).toEqual([]);
  });
});

describe('clicking what is under the pointer', () => {
  /** A click with the mouse at this point (the camera shows the world as it is). */
  const click = (x: number, y: number) => {
    const event = {
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
      pointerId: 1,
      preventDefault: () => {},
    };
    const input = engine as unknown as Record<
      'onPointerDown' | 'onPointerUp',
      (e: unknown) => void
    >;
    input.onPointerDown(event);
    input.onPointerUp(event);
  };
  const show = (...elements: SceneElement[]) => engine.loadPage(elements, { x: 0, y: 0, zoom: 1 });

  it("a shown private note's open padlock asks to hide it; a hidden one has none", () => {
    const hidden: string[] = [];
    engine.subscribeHide((id) => hidden.push(id));
    const shown = note('p', 1, { private: true, x: 100, y: 100 });
    const locked = note('h', 2, { private: true, concealed: true, x: 400, y: 100 });
    show(shown, locked);
    const badge = privateBadge(shown);
    click(100 + badge.x, 100 + badge.y);
    click(400 + badge.x, 100 + badge.y);
    expect(hidden).toEqual(['p']);
  });

  it("a link's label opens its page, unless it is on the selection", () => {
    const opened: string[] = [];
    engine.onLinkOpen((page) => opened.push(page));
    engine.setLinkLabels(new Map([['p2', 'Lunes']]), '?');
    const linked = stroke('a', 1, { x: 100, y: 100, link: 'p2' });
    show(linked);
    const [badge] = linkBadges([linked], () => ({ text: 'Lunes', missing: false }), 1);
    const { minX, minY, maxX, maxY } = badge.rect;
    select('a');
    click((minX + maxX) / 2, (minY + maxY) / 2);
    expect(opened).toEqual([]);
    engine.clearSelection();
    click((minX + maxX) / 2, (minY + maxY) / 2);
    expect(opened).toEqual(['p2']);
  });

  it("a task's checkbox is ticked with the selection tools, not with the others", () => {
    const task = text('t', 1, { text: '[ ] pan', x: 100, y: 100, width: 200, height: 40 });
    show(task);
    // Where its checkbox is.
    let box: { x: number; y: number } | null = null;
    for (let x = 100; x < 300 && !box; x++) {
      for (let y = 100; y < 140 && !box; y++)
        if (taskAt(task, { x, y }, 0) !== null) box = { x, y };
    }
    engine.setTool('pen');
    click(box!.x, box!.y);
    expect(get('t')).toMatchObject({ text: '[ ] pan' });
    engine.setTool('select');
    click(box!.x, box!.y);
    expect(get('t')).toMatchObject({ text: '[x] pan' });
    expect(selected()).toEqual([]);
    engine.undo();
    expect(get('t')).toMatchObject({ text: '[ ] pan' });
  });
});

describe('exporting the page as a PNG', () => {
  it('in the diary, with the book; without it, only what is written', async () => {
    load(note('n', 1, { text: 'hola' }));
    drawnTexts.length = 0;
    await engine.exportPng();
    expect(drawnTexts).not.toContain('martes');
    engine.setBook({
      style: DEFAULT_BOOK_STYLE,
      date: 'martes',
      title: '',
      today: false,
      pageNumber: 1,
      tabs: [],
      labels: { today: '', cues: '', notes: '', summary: '', tasks: '' },
    });
    drawnTexts.length = 0;
    expect(await engine.exportPng()).toBeTruthy();
    expect(drawnTexts).toContain('martes');
    expect(drawnTexts.join(' ')).toContain('hola');
  });
});
