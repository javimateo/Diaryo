import { describe, expect, it } from 'vitest';
import { fade, sampleSurface, type Surface } from './noise';

/** Gentle waves that repeat four times across a tile of 64. */
const waves: Surface = {
  height: (x, y) => Math.sin((x * Math.PI) / 8) * Math.cos((y * Math.PI) / 8),
  tone: (x, y) => 0.5 + 0.2 * Math.sin((x * Math.PI) / 8 + (y * Math.PI) / 16),
  relief: 0.3,
};

describe('surfaces', () => {
  it('a bigger size is the same tile with more detail', () => {
    const small = sampleSurface(waves, 64, 32, 2);
    const big = sampleSurface(waves, 64, 64, 2);
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 32; i++) {
        const k = j * 2 * 64 + i * 2;
        const mean = (big[k] + big[k + 1] + big[k + 64] + big[k + 65]) / 4;
        expect(mean).toBeCloseTo(small[j * 32 + i], 1);
      }
    }
  });

  it('lights the slopes facing the top left', () => {
    // A ramp going down to the bottom right: the whole slope faces the light.
    const ramp: Surface = { height: (x, y) => -(x + y) / 100, tone: () => 0.5, relief: 1 };
    const lit = sampleSurface(ramp, 64, 16);
    expect(lit[5 * 16 + 5]).toBeGreaterThan(0.5);
  });

  it('fades out details too small for the pixel', () => {
    expect(fade(4, 1)).toBe(1);
    expect(fade(2, 1)).toBe(0);
    expect(fade(1, 1)).toBe(0);
    expect(fade(3, 1)).toBeCloseTo(0.5);
  });
});
