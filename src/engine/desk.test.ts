import { describe, expect, it } from 'vitest';
import { DESK_TILE, deskColor, deskPixels } from './desk';

/** Resumen de los píxeles (comparar un millón de valores uno a uno es lentísimo). */
function checksum(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum = (sum * 31 + data[i]) | 0;
  return sum;
}

describe('mesas', () => {
  it('cada textura es siempre la misma y del tamaño de la baldosa', () => {
    for (const style of ['wood', 'cork', 'linen'] as const) {
      const a = deskPixels(style, 'light');
      expect(a).toHaveLength(DESK_TILE * DESK_TILE * 4);
      expect(checksum(deskPixels(style, 'light'))).toBe(checksum(a));
    }
  });

  it('la lisa no tiene textura ni color propio', () => {
    expect(deskColor('plain', 'light')).toBeNull();
    expect(deskColor('wood', 'dark')).toMatch(/^rgb\(/);
  });
});
