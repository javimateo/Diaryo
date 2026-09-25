import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDeskView, readToday, sameView, writeDeskView } from './saved';

afterEach(() => vi.unstubAllGlobals());

function storage(entries: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
}

describe('pinned view', () => {
  it('is saved and read', () => {
    storage();
    const view = { center: { x: 10, y: -4 }, zoom: 0.5 };
    expect(writeDeskView(view)).toBe(true);
    expect(readDeskView()).toEqual(view);
  });

  it('a broken view is like having none', () => {
    storage({ 'diaryo:desk-view': { center: { x: 'a', y: 0 }, zoom: 1 } });
    expect(readDeskView()).toBeNull();
    storage({ 'diaryo:desk-view': { center: { x: 0, y: 0 }, zoom: 0 } });
    expect(readDeskView()).toBeNull();
  });

  it('half a pixel of difference is the same view', () => {
    const a = { center: { x: 0, y: 0 }, zoom: 2 };
    expect(sameView({ center: { x: 0.2, y: 0 }, zoom: 2 }, a)).toBe(true);
    expect(sameView({ center: { x: 1, y: 0 }, zoom: 2 }, a)).toBe(false);
    expect(sameView({ center: { x: 0, y: 0 }, zoom: 2.1 }, a)).toBe(false);
  });
});

describe('mini diary', () => {
  it('only valid with all its fields', () => {
    const card = { day: '2026-09-25', image: 'data:', pending: 2, cover: '#b8573f' };
    storage({ 'diaryo:today': card });
    expect(readToday()).toEqual(card);
    storage({ 'diaryo:today': { ...card, pending: 'dos' } });
    expect(readToday()).toBeNull();
  });
});
