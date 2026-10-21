import { afterEach, describe, expect, it } from 'vitest';
// Fitting a box measures its text, on a canvas.
import './testCanvas';
import { finishEdit, readyToEdit } from './editing';
import { DEFAULT_STYLES, type NoteElement, type ShapeElement, type TextElement } from './elements';
import { setTextDates, type TextDates } from './text';

const base = { rotation: 0, opacity: 1, groupId: null, locked: false, x: 0, y: 0, z: 1 };

const text = (more: Partial<TextElement> = {}): TextElement => ({
  ...base,
  id: 't',
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

const note = (more: Partial<NoteElement> = {}): NoteElement => ({
  ...base,
  id: 'n',
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

const shape = (more: Partial<ShapeElement> = {}): ShapeElement => ({
  ...base,
  id: 'r',
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

afterEach(() => setTextDates(null));

describe('opening the editor', () => {
  it('gives a shape without text an empty one in the default style, at the zoom', () => {
    const ready = readyToEdit(shape(), DEFAULT_STYLES, 2);
    expect(ready.label).toMatchObject({
      text: '',
      fontSize: DEFAULT_STYLES.shape.labelSize / 2,
      font: DEFAULT_STYLES.shape.font,
    });
  });

  it('leaves alone what already has a place to write', () => {
    const labelled = shape({
      label: { ...readyToEdit(shape(), DEFAULT_STYLES, 1).label!, text: 'a' },
    });
    expect(readyToEdit(labelled, DEFAULT_STYLES, 1)).toBe(labelled);
    const t = text();
    expect(readyToEdit(t, DEFAULT_STYLES, 1)).toBe(t);
  });
});

describe('closing the editor', () => {
  it('saves what changed and gives it back to select', () => {
    const edited = text({ text: 'adiós' });
    const { changes, result } = finishEdit(edited, text(), false);
    expect(changes?.get('t')).toBe(edited);
    expect(result).toBe(edited);
  });

  it('saves nothing if nothing changed, unless it is new', () => {
    expect(finishEdit(text(), text(), false)).toEqual({ changes: null, result: text() });
    expect(finishEdit(text(), undefined, true).changes?.get('t')).toEqual(text());
  });

  it('deletes an emptied text (nothing to delete if it was new)', () => {
    expect(finishEdit(text({ text: ' \n' }), text(), false)).toEqual({
      changes: new Map([['t', null]]),
      result: null,
    });
    expect(finishEdit(text({ text: '' }), undefined, true)).toEqual({
      changes: null,
      result: null,
    });
  });

  it('keeps an empty note, and an empty shape without its label', () => {
    expect(finishEdit(note({ text: '' }), note(), false).result).toMatchObject({ text: '' });
    const labelled = readyToEdit(shape(), DEFAULT_STYLES, 1);
    const { changes, result } = finishEdit(labelled, shape(), false);
    expect(result).toMatchObject({ label: null });
    expect(changes).toBeNull();
  });

  it('writes the dates in full', () => {
    setTextDates({
      today: '2026-10-17',
      monthFirst: false,
      label: () => ({ text: 'mañana', tone: 'soon' }),
      complete: (t: string) => t.replace('@mañana', '@18/10/2026'),
    } as unknown as TextDates);
    const { result } = finishEdit(note({ text: 'cita @mañana' }), note(), false);
    expect(result).toMatchObject({ text: 'cita @18/10/2026' });
  });
});
