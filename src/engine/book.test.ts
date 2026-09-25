import { describe, expect, it } from 'vitest';
import {
  bookBounds,
  DEFAULT_BOOK_STYLE,
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
