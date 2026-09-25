import { describe, expect, it } from 'vitest';
import { shade } from './cover';

describe('tonos de las tapas', () => {
  it('aclara y oscurece sin salirse de rango', () => {
    expect(shade('#808080', 0)).toBe('rgb(128, 128, 128)');
    expect(shade('#808080', -0.5)).toBe('rgb(64, 64, 64)');
    expect(shade('#808080', 1)).toBe('rgb(255, 255, 255)');
    expect(shade('#b8573f', -1)).toBe('rgb(0, 0, 0)');
  });
});
