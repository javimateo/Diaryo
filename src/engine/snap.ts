import type { Bounds } from './geometry';

/**
 * Guides when placing: while moving or resizing, the edges and center of what is dragged
 * stick to those of what is around (and of the page), and a line shows where. Ctrl
 * places freely.
 */

/** What can be stuck to: the boxes around and the page's areas. */
export interface SnapTargets {
  boxes: Bounds[];
}

/** A guide to draw: a vertical (x) or horizontal (y) line between `from` and `to`. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** The lines of a box on an axis: both edges and the center. */
const linesOf = (b: Bounds, axis: 'x' | 'y') =>
  axis === 'x' ? [b.minX, (b.minX + b.maxX) / 2, b.maxX] : [b.minY, (b.minY + b.maxY) / 2, b.maxY];

/**
 * The smallest shift (within `tolerance`) that puts one of `values` on a line of the
 * targets, or 0.
 */
function nearest(values: number[], targets: SnapTargets, axis: 'x' | 'y', tolerance: number) {
  let best = 0;
  let found = false;
  for (const box of targets.boxes) {
    for (const line of linesOf(box, axis)) {
      for (const value of values) {
        const shift = line - value;
        if (Math.abs(shift) <= tolerance && (!found || Math.abs(shift) < Math.abs(best))) {
          best = shift;
          found = true;
        }
      }
    }
  }
  return best;
}

/** How far to shift a moved box so it sits on the nearest lines (each axis apart). */
export function snapMove(box: Bounds, targets: SnapTargets, tolerance: number) {
  return {
    dx: nearest(linesOf(box, 'x'), targets, 'x', tolerance),
    dy: nearest(linesOf(box, 'y'), targets, 'y', tolerance),
  };
}

/** Where a dragged edge (or a point being dragged) goes: onto the nearest line, if close. */
export const snapValue = (
  value: number,
  targets: SnapTargets,
  axis: 'x' | 'y',
  tolerance: number,
) => value + nearest([value], targets, axis, tolerance);

/**
 * The guides to show for a box already placed: each of its lines that sits on a target's,
 * spanning both. `only` limits them to some of its lines (when resizing, the edges that
 * moved).
 */
export function guidesFor(
  box: Bounds,
  targets: SnapTargets,
  epsilon: number,
  only?: { x?: number[]; y?: number[] },
): Guide[] {
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const values = only ? (only[axis] ?? []) : linesOf(box, axis);
    for (const value of values) {
      for (const target of targets.boxes) {
        if (!linesOf(target, axis).some((line) => Math.abs(line - value) <= epsilon)) continue;
        const [from, to] =
          axis === 'x'
            ? [Math.min(box.minY, target.minY), Math.max(box.maxY, target.maxY)]
            : [Math.min(box.minX, target.minX), Math.max(box.maxX, target.maxX)];
        guides.push({ axis, at: value, from, to });
      }
    }
  }
  return guides;
}
