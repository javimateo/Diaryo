import { describe, expect, it } from 'vitest';
import { arrange, flip } from './arrange';
import type { StrokeElement } from './elements';
import { toWorld } from './elements';

function line(id: string, z: number, x = 0): StrokeElement {
  return {
    id,
    type: 'stroke',
    kind: 'pen',
    z,
    x,
    y: 0,
    rotation: 0,
    opacity: 1,
    groupId: null,
    locked: false,
    points: [0, 0, 0.5, 100, 0, 0.5],
    simulatePressure: true,
    color: 'ink',
    size: 4,
    fill: null,
    fillStyle: 'solid',
    label: null,
  };
}

const all = [line('a', 1), line('b', 2), line('c', 3), line('d', 4)];

/** Resulting order from bottom to top. */
const orderAfter = (ids: string[], mode: Parameters<typeof arrange>[2]) => {
  const changes = arrange(all, new Set(ids), mode);
  return all
    .map((el) => changes.get(el.id) ?? el)
    .sort((a, b) => a!.z - b!.z)
    .map((el) => el!.id);
};

describe('layers', () => {
  it('bring to front and send to back', () => {
    expect(orderAfter(['b'], 'front')).toEqual(['a', 'c', 'd', 'b']);
    expect(orderAfter(['c'], 'back')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('forward and backward move a single step', () => {
    expect(orderAfter(['a'], 'forward')).toEqual(['b', 'a', 'c', 'd']);
    expect(orderAfter(['d'], 'backward')).toEqual(['a', 'b', 'd', 'c']);
    // A selected block slides as a whole.
    expect(orderAfter(['a', 'b'], 'forward')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('only changes what is needed', () => {
    expect(arrange(all, new Set(['d']), 'forward').size).toBe(0);
    expect(arrange(all, new Set(['a']), 'forward').size).toBe(2);
  });
});

describe('flip', () => {
  it('mirrors around the center of the selection', () => {
    const [a, b] = [line('a', 1, 0), line('b', 2, 200)];
    const changes = flip([a, b], 'horizontal');
    const fa = changes.get('a') as StrokeElement;
    // The one on the left goes to the right.
    const start = toWorld(fa, { x: fa.points[0], y: fa.points[1] });
    expect(start.x).toBeCloseTo(300, 0);
  });
});
