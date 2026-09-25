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

/** Flecha de la caja `a` (en 0,0) a la caja `b` (en 300,0), apuntando a sus centros. */
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

describe('flechas enganchadas', () => {
  it('los extremos quedan en el borde de cada caja, sin tocarla', () => {
    const { get } = setup();
    const start = arrowStart(get());
    const end = arrowEnd(get());
    // Borde derecho de `a` (x = 100) y borde izquierdo de `b` (x = 300), con separación.
    expect(start.x).toBeGreaterThan(100);
    expect(start.x).toBeLessThan(120);
    expect(end.x).toBeLessThan(300);
    expect(end.x).toBeGreaterThan(280);
    expect(start.y).toBeCloseTo(50);
  });

  it('al mover una caja, la flecha la sigue; deshacer la devuelve', () => {
    const { scene, history, get } = setup();
    const before = arrowEnd(get());
    history.commit(new Map([['b', translateElement(scene.get('b')!, 0, 200)]]));
    expect(arrowEnd(get()).y).toBeGreaterThan(before.y + 100);
    history.undo();
    expect(arrowEnd(get()).x).toBeCloseTo(before.x);
    expect(arrowEnd(get()).y).toBeCloseTo(before.y);
  });

  it('si se borra una caja, el extremo se queda donde estaba; deshacer lo recoloca', () => {
    const { scene, history, get } = setup();
    const end = arrowEnd(get());
    history.commit(new Map([['b', null]]));
    expect(arrowEnd(get())).toEqual(end);
    history.undo();
    // Vuelve a seguir a la caja.
    history.commit(new Map([['b', translateElement(scene.get('b')!, 0, 200)]]));
    expect(arrowEnd(get()).y).toBeGreaterThan(end.y + 100);
  });

  it('mover la flecha sola la suelta; con lo que conecta, no', () => {
    const f = arrow();
    expect(detachMoved(f, new Set(['f']))).toMatchObject({ start: null, end: null });
    expect(detachMoved(f, new Set(['f', 'a', 'b']))).toBe(f);
  });

  it('sin nada enganchado, la flecha no se mueve sola', () => {
    const loose = arrow({ start: null, end: null });
    expect(routeArrow(loose, () => undefined)).toMatchObject({
      x: 50,
      y: 50,
      points: loose.points,
    });
  });
});
