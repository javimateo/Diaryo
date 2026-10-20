import type { BookSpread } from './book';
import { textOf, withText } from './containers';
import type { EditableElement, SceneElement, StrokeElement } from './elements';
import type { Bounds } from './geometry';
import { clamp, easeOutCubic } from './math';
import type { TurnDirection } from './pageTurn';

/**
 * A short scene that plays by itself (the tour's): what the canvas shows at each moment,
 * made of the usual elements. `frame` alone says where everything is, so with reduced
 * motion only the last frame is shown; turning a page is the one movement the engine
 * animates on top (towards what `frame` shows after it).
 */
export interface Clip {
  /** In milliseconds. After it, the last frame stays. */
  duration: number;
  /** What is framed (world coordinates). */
  bounds: Bounds;
  frame(t: number): ClipFrame;
  /** Sheets that turn by themselves, from `at` for `duration` milliseconds. */
  turns?: { at: number; dir: TurnDirection; duration: number }[];
  /** The desk is transparent: only the book shows (the floating diary). */
  transparent?: boolean;
}

export interface ClipFrame {
  book: BookSpread | null;
  elements: SceneElement[];
  /** The ids of what is on the desk: it stays on top when the page turns. */
  desk?: string[];
}

/** How far `t` is from `start` to `start + length`: 0 before, 1 after. */
export const progress = (t: number, start: number, length: number): number =>
  clamp((t - start) / length, 0, 1);

/** The stroke drawn up to `p` (0…1) of its length, as the pen goes. Null before it starts. */
export function drawn(el: StrokeElement, p: number): StrokeElement | null {
  if (p <= 0) return null;
  if (p >= 1) return el;
  const count = Math.max(2, Math.round((el.points.length / 3) * p));
  return { ...el, points: el.points.slice(0, count * 3) };
}

/**
 * The text written up to `p` (0…1), letter by letter; the first `keep` letters are there
 * from the start (e.g. a task's "[ ] "). Null before anything shows.
 */
export function typed<T extends EditableElement>(el: T, p: number, keep = 0): T | null {
  if (p >= 1) return el;
  const letters = Array.from(textOf(el));
  const count = keep + Math.round((letters.length - keep) * Math.max(0, p));
  return count > 0 ? withText(el, letters.slice(0, count).join('')) : null;
}

/** Height a dropped element falls from, in world units. */
const DROP_HEIGHT = 160;

/** The element falling into place (it lands at `p` = 1), turning a little. */
export function dropped<T extends SceneElement>(el: T, p: number): T | null {
  if (p <= 0) return null;
  if (p >= 1) return el;
  const left = 1 - easeOutCubic(p);
  return {
    ...el,
    y: el.y - DROP_HEIGHT * left,
    rotation: el.rotation - 0.3 * left,
    opacity: el.opacity * Math.min(1, p * 2),
  };
}

/** The elements that show (those that haven't started are null). */
export const shown = (...elements: (SceneElement | null)[]): SceneElement[] =>
  elements.filter((el): el is SceneElement => el !== null);
