import { describe, expect, it } from 'vitest';
import { DESK_TILE, deskColor, deskPixels } from './desk';

/** Summary of the pixels (comparing a million values one by one is very slow). */
function checksum(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum = (sum * 31 + data[i]) | 0;
  return sum;
}

describe('desks', () => {
  it('each texture is always the same and the size of the tile', () => {
    for (const style of ['wood', 'cork', 'linen'] as const) {
      const a = deskPixels(style, 'light');
      expect(a).toHaveLength(DESK_TILE * DESK_TILE * 4);
      expect(checksum(deskPixels(style, 'light'))).toBe(checksum(a));
    }
  });

  it('the plain one has no texture or color of its own', () => {
    expect(deskColor('plain', 'light')).toBeNull();
    expect(deskColor('wood', 'dark')).toMatch(/^rgb\(/);
  });
});
