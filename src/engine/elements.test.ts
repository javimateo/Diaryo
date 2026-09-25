import { describe, expect, it } from 'vitest';
import { clampSize, SIZE_RANGES, stepSize } from './elements';

describe('brush size', () => {
  it('clamps and snaps to the step', () => {
    expect(clampSize('pen', 0.2)).toBe(SIZE_RANGES.pen.min);
    expect(clampSize('pen', 999)).toBe(SIZE_RANGES.pen.max);
    expect(clampSize('pen', 3.3)).toBe(3.5);
    expect(clampSize('marker', 17.4)).toBe(17);
  });

  it('+ and − always change the value until the limit', () => {
    expect(stepSize('pen', 1, 1)).toBeGreaterThan(1);
    expect(stepSize('marker', 20, 1)).toBe(24);
    expect(stepSize('marker', 20, -1)).toBe(17);
    expect(stepSize('pen', SIZE_RANGES.pen.min, -1)).toBe(SIZE_RANGES.pen.min);
    expect(stepSize('marker', SIZE_RANGES.marker.max, 1)).toBe(SIZE_RANGES.marker.max);
  });
});
