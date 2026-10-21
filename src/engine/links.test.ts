import { describe, expect, it } from 'vitest';
import { linkAt, type LinkBadge } from './links';

const badge = (link: string, ids: string[], minX: number): LinkBadge => ({
  link,
  ids,
  label: { text: link, missing: false },
  rect: { minX, minY: 0, maxX: minX + 50, maxY: 20 },
});

describe('clicking a link label', () => {
  it('gives the page of the label under the point (the last drawn wins)', () => {
    const badges = [badge('p1', ['a'], 0), badge('p2', ['b'], 30)];
    expect(linkAt(badges, new Set(), { x: 10, y: 10 })).toBe('p1');
    expect(linkAt(badges, new Set(), { x: 40, y: 10 })).toBe('p2');
    expect(linkAt(badges, new Set(), { x: 200, y: 10 })).toBeNull();
  });

  it("ignores the selection's labels: there its handles win", () => {
    const badges = [badge('p1', ['a'], 0), badge('p2', ['b', 'c'], 30)];
    expect(linkAt(badges, new Set(['c']), { x: 40, y: 10 })).toBe('p1');
    expect(linkAt(badges, new Set(['a', 'c']), { x: 40, y: 10 })).toBeNull();
  });
});
