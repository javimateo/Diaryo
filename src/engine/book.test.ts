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
});

describe('pestañas de las páginas importantes', () => {
  it('cada pestaña tiene su hueco y asoma por su lado', () => {
    const rects = tabRects(spread([tab('a', 'left'), tab('b', 'right'), tab('c', 'right')]));
    expect(rects[0].maxX).toBeLessThan(0);
    expect(rects[1].minX).toBeGreaterThan(0);
    // Huecos distintos: no se tapan.
    expect(rects[1].minY).toBeGreaterThanOrEqual(rects[0].maxY);
    expect(rects[2].minY).toBeGreaterThanOrEqual(rects[1].maxY);
  });

  it('solo se pulsa la parte que asoma por fuera de las tapas', () => {
    const s = spread([tab('a', 'right')]);
    const [r] = tabRects(s);
    const y = (r.minY + r.maxY) / 2;
    expect(tabAt(s, { x: r.maxX - 5, y })?.pageId).toBe('a');
    // Bajo las tapas (sobre la página) no cuenta: ahí se escribe.
    expect(tabAt(s, { x: PAGE_WIDTH - 10, y })).toBeNull();
  });

  it('con pestañas, el libro deja sitio a los dos lados (el encuadre no cambia al pasar)', () => {
    const plain = bookBounds(spread([]));
    const right = bookBounds(spread([tab('a', 'right')]));
    const left = bookBounds(spread([tab('a', 'left')]));
    expect(right.maxX).toBeGreaterThan(plain.maxX);
    expect(right).toEqual(left);
  });
});
