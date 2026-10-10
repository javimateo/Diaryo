import { describe, expect, it } from 'vitest';
import { sizeFor } from './textures';

describe('texture sizes', () => {
  it('grows with the zoom, one texture pixel per screen pixel at most', () => {
    expect(sizeFor(512, 0.3)).toBe(256);
    expect(sizeFor(512, 1)).toBe(512);
    expect(sizeFor(512, 1.5)).toBe(1024);
  });

  it('stops at half a world unit per pixel, and at the biggest size', () => {
    expect(sizeFor(512, 8)).toBe(1024);
    expect(sizeFor(640, 8)).toBe(1024);
    expect(sizeFor(1280, 8)).toBe(2048);
    expect(sizeFor(5000, 8)).toBe(2048);
  });
});
