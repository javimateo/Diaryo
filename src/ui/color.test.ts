import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from './color';

describe('colors', () => {
  it('goes from hex to HSV and back without changing the color', () => {
    for (const hex of ['#000000', '#ffffff', '#b8573f', '#46699c', '#4f7d5c', '#c99a2e']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('reads the pure colors right', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexToHsv('#808080').s).toBe(0);
  });

  it('accepts a color however it is typed, and nothing else', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #B8573F ')).toBe('#b8573f');
    expect(normalizeHex('b8573f')).toBe('#b8573f');
    for (const wrong of ['', '#ab', 'abcd', '#gggggg', 'red'])
      expect(normalizeHex(wrong)).toBeNull();
  });
});
