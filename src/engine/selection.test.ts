import { describe, expect, it } from 'vitest';
import { parseElements, serializeElements } from './clipboard';
import { elementBounds, toWorld, type StrokeElement } from './elements';
import { Scene } from './scene';
import {
  elementsInLasso,
  elementsInRect,
  hitHandle,
  hitTestElement,
  pointInPolygon,
  resizeCursor,
} from './selection';
import { strokeHitsSegment } from './strokes';
import { rotateElement, scaleElement, selectionBox, translateElement } from './transform';

// Horizontal line 100 units long starting at (x, y).
function line(id: string, x: number, y: number, z = 1): StrokeElement {
  return {
    id,
    type: 'stroke',
    kind: 'pen',
    z,
    x,
    y,
    rotation: 0,
    opacity: 1,
    groupId: null,
    locked: false,
    points: [0, 0, 0.5, 50, 0, 0.5, 100, 0, 0.5],
    simulatePressure: true,
    color: 'ink',
    size: 4,
    fill: null,
    fillStyle: 'solid',
    label: null,
  };
}

const sceneWith = (...elements: StrokeElement[]) => {
  const scene = new Scene();
  scene.apply(new Map(elements.map((el) => [el.id, el])));
  return scene;
};

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.y).toBeCloseTo(b.y, 1);
};

describe('transformations', () => {
  it('moving keeps the points (and the outline cache)', () => {
    const el = line('a', 0, 0);
    const moved = translateElement(el, 10, 20);
    expect(moved.points).toBe(el.points);
    expect(elementBounds(moved).minX).toBeCloseTo(elementBounds(el).minX + 10);
  });

  it('rotating 90° around the center leaves a vertical line', () => {
    const el = line('a', 0, 0);
    const rotated = rotateElement(el, { x: 50, y: 0 }, Math.PI / 2);
    close(toWorld(rotated, { x: 0, y: 0 }), { x: 50, y: -50 });
    close(toWorld(rotated, { x: 100, y: 0 }), { x: 50, y: 50 });
    const b = elementBounds(rotated);
    expect(b.maxX - b.minX).toBeCloseTo(4); // just the thickness
    expect(b.maxY - b.minY).toBeCloseTo(104);
  });

  it('uniform scaling keeps the rotation and scales the width', () => {
    const el = rotateElement(line('a', 0, 0), { x: 0, y: 0 }, 0.3);
    const box = selectionBox([el])!;
    const scaled = scaleElement(el, box, { x: -box.width / 2, y: -box.height / 2 }, 2, 2);
    expect(scaled.rotation).toBeCloseTo(0.3);
    expect(scaled.size).toBeCloseTo(8);
    expect(selectionBox([scaled])!.width).toBeCloseTo(box.width * 2);
  });

  it('stretching one axis of a rotated box deforms along the box axes', () => {
    const el = rotateElement(line('a', 0, 0), { x: 0, y: 0 }, Math.PI / 4);
    const box = selectionBox([el])!;
    const stretched = scaleElement(el, box, { x: -box.width / 2, y: 0 }, 3, 1);
    expect(stretched.rotation).toBeCloseTo(Math.PI / 4);
    // The line is now three times as long along its direction.
    const a = toWorld(stretched, { x: stretched.points[0], y: stretched.points[1] });
    const b = toWorld(stretched, { x: stretched.points[6], y: stretched.points[7] });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(300, 0);
  });
});

describe('selection box', () => {
  it('a rotated element has a rotated box; several, an aligned one', () => {
    const a = rotateElement(line('a', 0, 0), { x: 50, y: 0 }, 0.5);
    expect(selectionBox([a])!.rotation).toBeCloseTo(0.5);
    expect(selectionBox([a])!.width).toBeCloseTo(104);
    expect(selectionBox([a, line('b', 0, 100)])!.rotation).toBe(0);
  });

  it('detects the handles and the right cursor', () => {
    const box = { cx: 0, cy: 0, width: 200, height: 100, rotation: 0 };
    expect(hitHandle(box, { x: 100, y: 50 }, 1)).toBe('se');
    expect(hitHandle(box, { x: 100, y: 10 }, 1)).toBe('e');
    expect(hitHandle(box, { x: 0, y: -72 }, 1)).toBe('rotate');
    expect(hitHandle(box, { x: 0, y: 0 }, 1)).toBeNull();
    expect(resizeCursor('e', 0)).toBe('ew-resize');
    expect(resizeCursor('e', Math.PI / 2)).toBe('ns-resize');
    expect(resizeCursor('se', 0)).toBe('nwse-resize');
  });
});

describe('selecting', () => {
  it('click: the topmost element under the mouse', () => {
    const scene = sceneWith(line('abajo', 0, 0, 1), line('arriba', 0, 0, 2));
    expect(hitTestElement(scene, { x: 50, y: 1 }, 3)?.id).toBe('arriba');
    expect(hitTestElement(scene, { x: 50, y: 30 }, 3)).toBeNull();
  });

  it('hits rotated strokes', () => {
    const el = rotateElement(line('a', 0, 0), { x: 50, y: 0 }, Math.PI / 2);
    expect(strokeHitsSegment(el, { x: 50, y: 40 }, { x: 50, y: 40 }, 1)).toBe(true);
    expect(strokeHitsSegment(el, { x: 90, y: 0 }, { x: 90, y: 0 }, 1)).toBe(false);
  });

  it('rectangle: only what is fully inside', () => {
    const scene = sceneWith(line('dentro', 0, 0), line('cortado', 150, 0));
    const ids = elementsInRect(scene, { minX: -10, minY: -10, maxX: 200, maxY: 10 }).map(
      (e) => e.id,
    );
    expect(ids).toEqual(['dentro']);
  });

  it('lasso: surrounding most of the stroke is enough', () => {
    const scene = sceneWith(line('casi', 0, 0), line('fuera', 0, 100));
    // Surrounds x ∈ [-10, 95]: leaves out the tiny end of "almost".
    const lasso = [
      { x: -10, y: -10 },
      { x: 95, y: -10 },
      { x: 95, y: 10 },
      { x: -10, y: 10 },
    ];
    expect(pointInPolygon({ x: 0, y: 0 }, lasso)).toBe(true);
    expect(elementsInLasso(scene, lasso).map((e) => e.id)).toEqual(['casi']);
  });
});

describe('clipboard', () => {
  it('copies and pastes elements', () => {
    const text = serializeElements({ elements: [line('a', 5, 6)], assets: {} });
    const [pasted] = parseElements(text)!.elements as StrokeElement[];
    expect(pasted.x).toBe(5);
    expect(pasted.points).toEqual(line('a', 0, 0).points);
  });

  it("ignores text that doesn't come from diaryo", () => {
    expect(parseElements('hola')).toBeNull();
    expect(parseElements('{"type":"otra-app"}')).toBeNull();
  });
});
