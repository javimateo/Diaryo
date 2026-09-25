import { describe, expect, it } from 'vitest';
import { createNote } from './editing';
import { DEFAULT_STYLES, type StrokeElement } from './elements';
import { selectionStyle } from './selectionStyle';

const note = (color: string) => ({
  ...createNote({ x: 0, y: 0 }, 1, DEFAULT_STYLES, 1),
  color: color as never,
});

describe('common style of the selection', () => {
  it('with nothing selected there is no style', () => {
    expect(selectionStyle([])).toBeNull();
  });

  it('what they all share shows; if it differs, it is null', () => {
    const same = selectionStyle([note('yellow'), note('yellow')]);
    expect(same?.hasNotes).toBe(true);
    expect(same?.noteColor).toBe('yellow');
    expect(selectionStyle([note('yellow'), note('pink')])?.noteColor).toBeNull();
  });

  it('the size can only change if everything is of the same kind', () => {
    const stroke: StrokeElement = {
      id: 's',
      type: 'stroke',
      kind: 'pen',
      z: 2,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      groupId: null,
      locked: false,
      points: [0, 0, 0.5, 10, 0, 0.5],
      simulatePressure: true,
      color: 'ink',
      size: 4,
    } as StrokeElement;
    expect(selectionStyle([note('yellow')])?.sizeKind).toBe('text');
    expect(selectionStyle([stroke])).toMatchObject({ sizeKind: 'pen', size: 4 });
    expect(selectionStyle([note('yellow'), stroke])?.sizeKind).toBeNull();
  });
});
