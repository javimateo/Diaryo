import { describe, expect, it } from 'vitest';
import { arrivedInstead, neighbor, newPage, positionInDay, type PageMeta } from './pages';

const page = (id: string, date: string, order = 1): PageMeta => ({
  id,
  date,
  order,
  title: '',
  thumbnail: null,
  bookmark: null,
  updatedAt: 1,
});

describe('page order', () => {
  const pages = [page('b', '2026-09-24', 2), page('c', '2026-09-25'), page('a', '2026-09-24', 1)];

  it('by day and, within the day, by creation order', () => {
    expect(neighbor(pages, pages[2], 1)?.id).toBe('b');
    expect(neighbor(pages, pages[0], 1)?.id).toBe('c');
    expect(neighbor(pages, pages[1], 1)).toBeNull();
    expect(neighbor(pages, pages[2], -1)).toBeNull();
  });

  it('a page not saved yet also has neighbours', () => {
    const blank = newPage('2026-09-30');
    expect(neighbor(pages, blank, -1)?.id).toBe('c');
  });

  it('position within the day', () => {
    expect(positionInDay(pages, pages[0])).toEqual({ index: 2, total: 2 });
    expect(positionInDay(pages, pages[1])).toBeNull();
  });
});

describe('a page of the day made on another device', () => {
  const blank = newPage('2026-10-07');
  const theirs = page('theirs', '2026-10-07');
  const pages = [page('other-day', '2026-10-06'), theirs];

  it('opens in place of the blank one open here', () => {
    expect(arrivedInstead(pages, blank, true, new Set(['theirs']))?.id).toBe('theirs');
  });

  it('not if the open one has something or a title, or it came for another day', () => {
    expect(arrivedInstead(pages, blank, false, new Set(['theirs']))).toBeUndefined();
    expect(arrivedInstead(pages, { ...blank, title: 'Mía' }, true)).toBeUndefined();
    expect(arrivedInstead(pages, blank, true, new Set(['other-day']))).toBeUndefined();
  });
});
