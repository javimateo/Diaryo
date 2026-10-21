import { describe, expect, it } from 'vitest';
import { guidesFor, snapMove, snapValue } from './snap';

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('guides when placing', () => {
  // A note, and a photo being dragged near it.
  const note = box(0, 0, 200, 200);
  const targets = { boxes: [note] };

  it('a moved box sticks to the nearest edge or center, on each axis apart', () => {
    // The photo's left edge 3 away from the note's: it moves the 3; vertically too far.
    expect(snapMove(box(3, 300, 103, 400), targets, 6)).toEqual({ dx: -3, dy: 0 });
    // Its center near the note's center.
    expect(snapMove(box(52, 52, 152, 152), targets, 6)).toEqual({ dx: -2, dy: -2 });
  });

  it('keeps the closest of several lines, and nothing beyond the tolerance', () => {
    const two = { boxes: [note, box(205, 0, 300, 50)] };
    // Right edge at 203: 3 from the note's (200), 2 from the other's left edge (205).
    expect(snapMove(box(103, 300, 203, 400), two, 6).dx).toBe(2);
    expect(snapMove(box(20, 300, 120, 400), targets, 6)).toEqual({ dx: 0, dy: 0 });
  });

  it("a dragged edge lands on a line (stretching a photo to the note's height)", () => {
    expect(snapValue(196, targets, 'y', 6)).toBe(200);
    expect(snapValue(180, targets, 'y', 6)).toBe(180);
  });

  it('shows a guide for each line that sits on a target, spanning both', () => {
    const photo = box(0, 250, 80, 300);
    expect(guidesFor(photo, targets, 0.01)).toEqual([{ axis: 'x', at: 0, from: 0, to: 300 }]);
    // Resizing, only the edges that moved count.
    expect(guidesFor(box(20, 20, 200, 200), targets, 0.01, { x: [200] })).toEqual([
      { axis: 'x', at: 200, from: 0, to: 200 },
    ]);
  });
});
