import { describe, expect, it } from 'vitest';
import { arrowEnd, arrowStart, detachMoved, routeArrow } from './arrows';
import type { ArrowElement, SceneElement, ShapeElement } from './elements';
import { History } from './history';
import { Scene } from './scene';
import { translateElement } from './transform';

const box = (id: string, x: number, y: number): ShapeElement => ({
  id,
  type: 'shape',
  shape: 'rect',
  z: 1,
  x,
  y,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  color: 'ink',
  border: true,
  strokeWidth: 2,
  roughness: 0,
  seed: 1,
  fill: null,
  fillStyle: 'solid',
  label: null,
});

/** Arrow from box `a` (at 0,0) to box `b` (at 300,0), pointing at their centers. */
const arrow = (overrides: Partial<ArrowElement> = {}): ArrowElement => ({
  id: 'f',
  type: 'arrow',
  z: 3,
  x: 50,
  y: 50,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  points: [0, 0, 0, 300, 0, 0],
  bend: 0,
  start: { elementId: 'a', focus: { x: 0.5, y: 0.5 } },
  end: { elementId: 'b', focus: { x: 0.5, y: 0.5 } },
  color: 'ink',
  size: 2,
  roughness: 0,
  seed: 1,
  startHead: 'none',
  endHead: 'arrow',
  ...overrides,
});

function setup() {
  const scene = new Scene();
  const history = new History(scene, () => {});
  history.commit(
    new Map<string, SceneElement>([
      ['a', box('a', 0, 0)],
      ['b', box('b', 300, 0)],
      ['f', arrow()],
    ]),
  );
  const get = () => scene.get('f') as ArrowElement;
  return { scene, history, get };
}

describe('attached arrows', () => {
  it("the ends stay on each box's edge, without touching it", () => {
    const { get } = setup();
    const start = arrowStart(get());
    const end = arrowEnd(get());
    // Right edge of `a` (x = 100) and left edge of `b` (x = 300), with a gap.
    expect(start.x).toBeGreaterThan(100);
    expect(start.x).toBeLessThan(120);
    expect(end.x).toBeLessThan(300);
    expect(end.x).toBeGreaterThan(280);
    expect(start.y).toBeCloseTo(50);
  });

  it('when a box moves, the arrow follows it; undo brings it back', () => {
    const { scene, history, get } = setup();
    const before = arrowEnd(get());
    history.commit(new Map([['b', translateElement(scene.get('b')!, 0, 200)]]));
    expect(arrowEnd(get()).y).toBeGreaterThan(before.y + 100);
    history.undo();
    expect(arrowEnd(get()).x).toBeCloseTo(before.x);
    expect(arrowEnd(get()).y).toBeCloseTo(before.y);
  });

  it('if a box is deleted, the end stays where it was; undo repositions it', () => {
    const { scene, history, get } = setup();
    const end = arrowEnd(get());
    history.commit(new Map([['b', null]]));
    expect(arrowEnd(get())).toEqual(end);
    history.undo();
    // It follows the box again.
    history.commit(new Map([['b', translateElement(scene.get('b')!, 0, 200)]]));
    expect(arrowEnd(get()).y).toBeGreaterThan(end.y + 100);
  });

  it("moving the arrow alone detaches it; with what it connects, it doesn't", () => {
    const f = arrow();
    expect(detachMoved(f, new Set(['f']))).toMatchObject({ start: null, end: null });
    expect(detachMoved(f, new Set(['f', 'a', 'b']))).toBe(f);
  });

  it("with nothing attached, the arrow doesn't move by itself", () => {
    const loose = arrow({ start: null, end: null });
    expect(routeArrow(loose, () => undefined)).toMatchObject({
      x: 50,
      y: 50,
      points: loose.points,
    });
  });
});
