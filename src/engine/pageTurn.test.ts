import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOK_STYLE, PAGE_HEIGHT, PAGE_WIDTH } from './book';
import { PageTurner, type TurnTarget } from './pageTurn';

const W = PAGE_WIDTH;
const BOTTOM = PAGE_HEIGHT / 2;

const target = (id: string): TurnTarget => ({
  id,
  elements: [],
  book: {
    style: DEFAULT_BOOK_STYLE,
    date: '',
    title: '',
    today: false,
    pageNumber: 1,
    tabs: [],
    labels: { today: '', cues: '', notes: '', summary: '', tasks: '' },
  },
});

function setup(prev = true, next = true) {
  const onTurn = vi.fn();
  const turner = new PageTurner({
    renderTexture: () => ({}) as HTMLCanvasElement,
    invalidate: () => {},
    onTurn,
  });
  turner.setTargets(prev ? target('prev') : null, next ? target('next') : null);
  /** Lets the running animation finish. */
  const finish = () => turner.step(performance.now() + 10_000);
  return { turner, onTurn, finish };
}

describe('turning the page by dragging the corner', () => {
  it('only the outer corners can be grabbed, and only if there is a page on that side', () => {
    const { turner } = setup(false, true);
    expect(turner.cornerAt({ x: W - 20, y: BOTTOM - 20 }, 1)?.dir).toBe(1);
    expect(turner.cornerAt({ x: W / 2, y: 0 }, 1)).toBeNull();
    // Without a previous page, the left corners do nothing.
    expect(turner.cornerAt({ x: -W + 20, y: BOTTOM - 20 }, 1)).toBeNull();
  });

  it('released past the middle, the sheet falls and the page opens', () => {
    const { turner, onTurn, finish } = setup();
    expect(turner.grab({ x: W - 10, y: BOTTOM - 10 }, 1)).toBe(true);
    turner.drag({ x: -W / 2, y: BOTTOM - 100 });
    turner.release();
    expect(turner.busy).toBe(true);
    finish();
    expect(onTurn).toHaveBeenCalledWith(1);
    // It stays down until the new page is loaded.
    expect(turner.active).toBe(true);
    turner.end();
    expect(turner.active).toBe(false);
  });

  it('released before the middle, it goes back', () => {
    const { turner, onTurn, finish } = setup();
    turner.grab({ x: -W + 10, y: BOTTOM - 10 }, 1);
    turner.drag({ x: -W * 0.8, y: BOTTOM - 50 });
    turner.release();
    finish();
    expect(onTurn).not.toHaveBeenCalled();
    expect(turner.active).toBe(false);
  });

  it("the sheet doesn't separate from the spine", () => {
    const { turner } = setup();
    turner.grab({ x: W - 10, y: BOTTOM - 10 }, 1);
    // Far to the right: the corner can't move away from the spine more than the width.
    turner.drag({ x: W * 3, y: BOTTOM });
    const point = (turner as unknown as { curl: { point: { x: number; y: number } } }).curl.point;
    expect(Math.hypot(point.x, point.y - BOTTOM)).toBeLessThanOrEqual(W + 1e-6);
  });
});
