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

// Línea horizontal de 100 unidades que empieza en (x, y).
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

describe('transformaciones', () => {
  it('mover conserva los puntos (y la caché del contorno)', () => {
    const el = line('a', 0, 0);
    const moved = translateElement(el, 10, 20);
    expect(moved.points).toBe(el.points);
    expect(elementBounds(moved).minX).toBeCloseTo(elementBounds(el).minX + 10);
  });

  it('girar 90° alrededor del centro deja una línea vertical', () => {
    const el = line('a', 0, 0);
    const rotated = rotateElement(el, { x: 50, y: 0 }, Math.PI / 2);
    close(toWorld(rotated, { x: 0, y: 0 }), { x: 50, y: -50 });
    close(toWorld(rotated, { x: 100, y: 0 }), { x: 50, y: 50 });
    const b = elementBounds(rotated);
    expect(b.maxX - b.minX).toBeCloseTo(4); // solo el grosor
    expect(b.maxY - b.minY).toBeCloseTo(104);
  });

  it('escalar uniforme conserva el giro y escala el grosor', () => {
    const el = rotateElement(line('a', 0, 0), { x: 0, y: 0 }, 0.3);
    const box = selectionBox([el])!;
    const scaled = scaleElement(el, box, { x: -box.width / 2, y: -box.height / 2 }, 2, 2);
    expect(scaled.rotation).toBeCloseTo(0.3);
    expect(scaled.size).toBeCloseTo(8);
    expect(selectionBox([scaled])!.width).toBeCloseTo(box.width * 2);
  });

  it('estirar en un eje de una caja girada deforma en los ejes de la caja', () => {
    const el = rotateElement(line('a', 0, 0), { x: 0, y: 0 }, Math.PI / 4);
    const box = selectionBox([el])!;
    const stretched = scaleElement(el, box, { x: -box.width / 2, y: 0 }, 3, 1);
    expect(stretched.rotation).toBeCloseTo(Math.PI / 4);
    // La línea mide ahora el triple a lo largo de su dirección.
    const a = toWorld(stretched, { x: stretched.points[0], y: stretched.points[1] });
    const b = toWorld(stretched, { x: stretched.points[6], y: stretched.points[7] });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(300, 0);
  });
});

describe('caja de selección', () => {
  it('un elemento girado tiene una caja girada; varios, una alineada', () => {
    const a = rotateElement(line('a', 0, 0), { x: 50, y: 0 }, 0.5);
    expect(selectionBox([a])!.rotation).toBeCloseTo(0.5);
    expect(selectionBox([a])!.width).toBeCloseTo(104);
    expect(selectionBox([a, line('b', 0, 100)])!.rotation).toBe(0);
  });

  it('detecta las asas y el cursor adecuado', () => {
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

describe('seleccionar', () => {
  it('clic: el elemento de más arriba bajo el ratón', () => {
    const scene = sceneWith(line('abajo', 0, 0, 1), line('arriba', 0, 0, 2));
    expect(hitTestElement(scene, { x: 50, y: 1 }, 3)?.id).toBe('arriba');
    expect(hitTestElement(scene, { x: 50, y: 30 }, 3)).toBeNull();
  });

  it('acierta en trazos girados', () => {
    const el = rotateElement(line('a', 0, 0), { x: 50, y: 0 }, Math.PI / 2);
    expect(strokeHitsSegment(el, { x: 50, y: 40 }, { x: 50, y: 40 }, 1)).toBe(true);
    expect(strokeHitsSegment(el, { x: 90, y: 0 }, { x: 90, y: 0 }, 1)).toBe(false);
  });

  it('rectángulo: solo lo que queda dentro entero', () => {
    const scene = sceneWith(line('dentro', 0, 0), line('cortado', 150, 0));
    const ids = elementsInRect(scene, { minX: -10, minY: -10, maxX: 200, maxY: 10 }).map(
      (e) => e.id,
    );
    expect(ids).toEqual(['dentro']);
  });

  it('lazo: basta con rodear la mayor parte del trazo', () => {
    const scene = sceneWith(line('casi', 0, 0), line('fuera', 0, 100));
    // Rodea x ∈ [-10, 95]: deja fuera la puntita final de "casi".
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

describe('portapapeles', () => {
  it('copia y pega elementos', () => {
    const text = serializeElements({ elements: [line('a', 5, 6)], assets: {} });
    const [pasted] = parseElements(text)!.elements as StrokeElement[];
    expect(pasted.x).toBe(5);
    expect(pasted.points).toEqual(line('a', 0, 0).points);
  });

  it('ignora texto que no viene de diaryo', () => {
    expect(parseElements('hola')).toBeNull();
    expect(parseElements('{"type":"otra-app"}')).toBeNull();
  });
});
