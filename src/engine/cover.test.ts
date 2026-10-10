import { describe, expect, it } from 'vitest';
import { coverPixels, MATERIALS, shade } from './cover';

describe('cover tones', () => {
  it('lightens and darkens without going out of range', () => {
    expect(shade('#808080', 0)).toBe('rgb(128, 128, 128)');
    expect(shade('#808080', -0.5)).toBe('rgb(64, 64, 64)');
    expect(shade('#808080', 1)).toBe('rgb(255, 255, 255)');
    expect(shade('#b8573f', -1)).toBe('rgb(0, 0, 0)');
  });
});

describe('cover grains', () => {
  it('each material makes its texture, always the same', () => {
    for (const material of MATERIALS) {
      if (material === 'plain') continue;
      const a = coverPixels(material, 32);
      expect(a).toHaveLength(32 * 32 * 4);
      expect(coverPixels(material, 32)).toEqual(a);
    }
  });
});
