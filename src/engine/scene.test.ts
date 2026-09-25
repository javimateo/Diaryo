import { describe, expect, it } from 'vitest';
import type { StrokeElement } from './elements';
import { segmentSegmentDistanceSq } from './geometry';
import { History } from './history';
import { Scene } from './scene';
import { strokeHitsSegment } from './strokes';

function stroke(id: string, x: number, y: number, points: number[], z = 1): StrokeElement {
  return {
    id,
    type: 'stroke',
    kind: 'pen',
    z,
    x,
    y,
    rotation: 0,
    opacity: 1,
    groupId: null,
    locked: false,
    points,
    simulatePressure: true,
    color: 'ink',
    size: 4,
    fill: null,
    fillStyle: 'solid',
    label: null,
  };
}

// Horizontal line from (x, y) to (x + 100, y).
const line = (id: string, x: number, y: number, z = 1) =>
  stroke(id, x, y, [0, 0, 0.5, 50, 0, 0.5, 100, 0, 0.5], z);

describe('geometry', () => {
  it('distance between segments', () => {
    const d = (ax: number, ay: number, bx: number, by: number) =>
      Math.sqrt(
        segmentSegmentDistanceSq(
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: ax, y: ay },
          { x: bx, y: by },
        ),
      );
    expect(d(5, -5, 5, 5)).toBe(0); // they cross
    expect(d(0, 3, 10, 3)).toBeCloseTo(3); // parallel
    expect(d(13, 4, 20, 4)).toBeCloseTo(5); // end to end
  });
});

describe('Scene', () => {
  it('searches by area and sorts by z', () => {
    const scene = new Scene();
    scene.apply(
      new Map([
        ['b', line('b', 0, 0, 2)],
        ['a', line('a', 0, 10, 1)],
        ['far', line('far', 5000, 5000, 3)],
      ]),
    );
    const found = scene.search({ minX: -10, minY: -10, maxX: 50, maxY: 50 }).map((e) => e.id);
    expect(found).toEqual(['a', 'b']);
    expect(scene.nextZ()).toBe(4);
  });

  it('apply returns the inverse changes', () => {
    const scene = new Scene();
    const inverse = scene.apply(new Map([['a', line('a', 0, 0)]]));
    expect(scene.size).toBe(1);
    scene.apply(inverse);
    expect(scene.size).toBe(0);
    expect(scene.contentBounds()).toBeNull();
  });
});

describe('History', () => {
  it('undoes and redoes', () => {
    const scene = new Scene();
    let changes = 0;
    const history = new History(scene, () => changes++);

    history.commit(new Map([['a', line('a', 0, 0)]]));
    history.commit(new Map([['a', null]]));
    expect(scene.size).toBe(0);

    history.undo();
    expect(scene.get('a')).toBeDefined();
    history.undo();
    expect(scene.size).toBe(0);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(scene.size).toBe(1);
    expect(history.canRedo).toBe(true);

    // A new action clears what could be redone.
    history.commit(new Map([['b', line('b', 0, 50)]]));
    expect(history.canRedo).toBe(false);
    expect(changes).toBe(6);
  });
});

describe('strokeHitsSegment', () => {
  const el = line('a', 100, 100);

  it('detects an eraser crossing the stroke', () => {
    expect(strokeHitsSegment(el, { x: 150, y: 50 }, { x: 150, y: 150 }, 2)).toBe(true);
  });

  it('takes the radius and the width into account', () => {
    // 5 units from the line: thickness/2 (2) + radius (4) = 6 → touches.
    expect(strokeHitsSegment(el, { x: 150, y: 105 }, { x: 160, y: 105 }, 4)).toBe(true);
    expect(strokeHitsSegment(el, { x: 150, y: 110 }, { x: 160, y: 110 }, 4)).toBe(false);
  });

  it('works with a single-point stroke', () => {
    const dot = stroke('d', 0, 0, [0, 0, 0.5]);
    expect(strokeHitsSegment(dot, { x: 3, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true);
    expect(strokeHitsSegment(dot, { x: 9, y: 0 }, { x: 9, y: 0 }, 2)).toBe(false);
  });
});
