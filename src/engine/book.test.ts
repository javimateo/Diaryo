import { describe, expect, it } from 'vitest';
import {
  bookBounds,
  CLOSED_COVER,
  DEFAULT_BOOK_STYLE,
  isOnPage,
  PAGE_WIDTH,
  tabAt,
  tabRects,
  type BookSpread,
  type BookTab,
} from './book';

const tab = (pageId: string, side: BookTab['side'], current = false): BookTab => ({
  pageId,
  label: pageId,
  color: '#e9785f',
  side,
  current,
});

const spread = (tabs: BookTab[]): BookSpread => ({
  style: DEFAULT_BOOK_STYLE,
  date: '',
  title: '',
  today: false,
  pageNumber: 1,
  tabs,
  labels: { today: '', cues: '', notes: '', summary: '', tasks: '' },
});

describe('tabs of the important pages', () => {
  it('each tab has its slot and sticks out on its side', () => {
    const rects = tabRects(spread([tab('a', 'left'), tab('b', 'right'), tab('c', 'right')]));
    expect(rects[0].maxX).toBeLessThan(0);
    expect(rects[1].minX).toBeGreaterThan(0);
    // Different slots: they don't overlap.
    expect(rects[1].minY).toBeGreaterThanOrEqual(rects[0].maxY);
    expect(rects[2].minY).toBeGreaterThanOrEqual(rects[1].maxY);
  });

  it('only the part sticking out beyond the covers can be clicked', () => {
    const s = spread([tab('a', 'right')]);
    const [r] = tabRects(s);
    const y = (r.minY + r.maxY) / 2;
    expect(tabAt(s, { x: r.maxX - 5, y })?.pageId).toBe('a');
    // Under the covers (on the page) doesn't count: that's where you write.
    expect(tabAt(s, { x: PAGE_WIDTH - 10, y })).toBeNull();
  });

  it("with tabs, the book leaves room on both sides (the framing doesn't change when turning)", () => {
    const plain = bookBounds(spread([]));
    const right = bookBounds(spread([tab('a', 'right')]));
    const left = bookBounds(spread([tab('a', 'left')]));
    expect(right.maxX).toBeGreaterThan(plain.maxX);
    expect(right).toEqual(left);
  });
});

describe('the closed diary', () => {
  const box = (cx: number, cy: number) => ({
    minX: cx - 10,
    minY: cy - 10,
    maxX: cx + 10,
    maxY: cy + 10,
  });
  const closed = { ...spread([]), closed: true };

  it('its page is the front cover: the far side of the open book is outside it', () => {
    expect(isOnPage(box(0, 0), true)).toBe(true);
    expect(isOnPage(box(-PAGE_WIDTH + 20, 0))).toBe(true);
    expect(isOnPage(box(-PAGE_WIDTH + 20, 0), true)).toBe(false);
    expect(isOnPage(box(CLOSED_COVER.maxX - 5, CLOSED_COVER.maxY - 5), true)).toBe(true);
  });

  it('is framed around its cover, narrower than the open book', () => {
    const bounds = bookBounds(closed);
    const open = bookBounds(spread([]));
    expect(bounds.minX).toBeLessThanOrEqual(CLOSED_COVER.minX);
    expect(bounds.maxX).toBeGreaterThanOrEqual(CLOSED_COVER.maxX);
    expect(bounds.minY).toBeLessThan(CLOSED_COVER.minY);
    expect(bounds.maxX - bounds.minX).toBeLessThan((open.maxX - open.minX) / 1.8);
  });
});
