import { describe, expect, it } from 'vitest';
import { parseElements, serializeElements } from './clipboard';
import { containerArea, isClosedStroke } from './containers';
import type { ShapeElement, StrokeElement } from './elements';
import { shapeHitsPoint } from './shapes';

const shape = (overrides: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 's',
  type: 'shape',
  shape: 'rect',
  z: 1,
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  color: 'ink',
  border: true,
  strokeWidth: 2,
  roughness: 1,
  seed: 7,
  fill: null,
  fillStyle: 'hachure',
  label: null,
  ...overrides,
});

function stroke(points: [number, number][]): StrokeElement {
  return {
    id: 't',
    type: 'stroke',
    kind: 'pen',
    z: 1,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    groupId: null,
    locked: false,
    points: points.flatMap(([x, y]) => [x, y, 0.5]),
    simulatePressure: true,
    color: 'ink',
    size: 4,
    fill: null,
    fillStyle: 'solid',
    label: null,
  };
}

describe('shapes', () => {
  it('an empty shape is only grabbed by its border; with a fill, also from inside', () => {
    expect(shapeHitsPoint(shape(), { x: 100, y: 50 }, 4)).toBe(false);
    expect(shapeHitsPoint(shape(), { x: 1, y: 50 }, 4)).toBe(true);
    expect(shapeHitsPoint(shape({ fill: 'blue' }), { x: 100, y: 50 }, 4)).toBe(true);
    const ellipse = shape({ shape: 'ellipse' });
    expect(shapeHitsPoint(ellipse, { x: 100, y: 1 }, 4)).toBe(true);
    // Corner of the box: outside the ellipse.
    expect(shapeHitsPoint(ellipse, { x: 5, y: 5 }, 4)).toBe(false);
  });

  it("an ellipse's text goes in the inscribed rectangle", () => {
    const area = containerArea(shape({ shape: 'ellipse', width: 200, height: 200 }));
    expect(area.maxX - area.minX).toBeCloseTo(200 * Math.SQRT1_2);
  });

  it('they are copied and pasted with fill and text', () => {
    const label = {
      text: 'hola',
      fontSize: 20,
      font: 'inter',
      align: 'center',
      valign: 'middle',
    } as const;
    const text = serializeElements({ elements: [shape({ fill: 'pink', label })], assets: {} });
    const [pasted] = parseElements(text)!.elements as ShapeElement[];
    expect(pasted.fill).toBe('pink');
    expect(pasted.label?.text).toBe('hola');
  });
});

describe('closed strokes', () => {
  const circle = (gap: number) =>
    stroke(
      Array.from({ length: 40 }, (_, i) => {
        const a = (i / 39) * (Math.PI * 2 - gap);
        return [Math.cos(a) * 100, Math.sin(a) * 100] as [number, number];
      }),
    );

  it('a circle ending where it started is a closed shape', () => {
    expect(isClosedStroke(circle(0.05))).toBe(true);
  });

  it("an open arc isn't", () => {
    expect(isClosedStroke(circle(Math.PI))).toBe(false);
    expect(
      isClosedStroke(
        stroke([
          [0, 0],
          [100, 0],
        ]),
      ),
    ).toBe(false);
  });
});

describe('links to other pages', () => {
  it('they are saved and copied with the element', () => {
    const text = serializeElements({ elements: [shape({ link: 'pagina-1' })], assets: {} });
    const [pasted] = parseElements(text)!.elements;
    expect(pasted.link).toBe('pagina-1');
    // What was saved before links existed doesn't link to anything.
    const old = serializeElements({ elements: [shape()], assets: {} });
    expect(parseElements(old)!.elements[0].link).toBeNull();
  });
});
