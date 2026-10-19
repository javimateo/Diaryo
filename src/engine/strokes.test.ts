import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import { strokeOutline, type StrokeInput } from './strokes';

/** A check mark as drawn by hand on screen (px): slowing down, with a tremor, at the end. */
const GESTURE: number[] = [];
let seed = 7;
const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
for (let i = 0; i <= 12; i++) GESTURE.push(i * 5 + jitter(), i * 7 + jitter(), 0.5);
for (let i = 1; i <= 25; i++) GESTURE.push(60 + i * 6 + jitter(), 84 - i * 4 + jitter(), 0.5);
for (let i = 0; i < 6; i++) GESTURE.push(210 + i * 0.8 + jitter(), -16 + i * 0.6 + jitter(), 0.5);

/** The gesture as stored when drawn at this zoom with the 4 px pen (world units). */
const drawnAt = (zoom: number): StrokeInput => ({
  kind: 'pen',
  points: GESTURE.map((v, i) => (i % 3 === 2 ? v : v / zoom)),
  simulatePressure: true,
  size: 4 / zoom,
});

describe("a stroke's outline", () => {
  it('drawn very zoomed in has the shape of the same gesture at 100 % (no twisted ends)', () => {
    const normal = strokeOutline(drawnAt(1), true);
    const zoomed = strokeOutline(drawnAt(8), true).map(([x, y]) => [x * 8, y * 8]);
    expect(zoomed).toHaveLength(normal.length);
    zoomed.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(normal[i][0], 6);
      expect(y).toBeCloseTo(normal[i][1], 6);
    });
  });

  it('of a normal thickness or more, is just what the library draws', () => {
    for (const size of [4, 12]) {
      const stroke = { ...drawnAt(1), size };
      const triples: number[][] = [];
      for (let i = 0; i < stroke.points.length; i += 3) triples.push(stroke.points.slice(i, i + 3));
      const plain = getStroke(triples, {
        thinning: 0.45,
        smoothing: 0.5,
        streamline: 0.4,
        start: { cap: true, taper: 0 },
        end: { cap: true, taper: 0 },
        size,
        simulatePressure: true,
        last: true,
      });
      expect(strokeOutline(stroke, true)).toEqual(plain);
    }
  });
});
