import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cameraAt,
  cameraCenter,
  fitCamera,
  interpolateCamera,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';

const viewport = { width: 800, height: 600 };

describe('camera', () => {
  it('convierte entre pantalla y mundo en ambos sentidos', () => {
    const cam: Camera = { x: -120, y: 40, zoom: 2.5 };
    const p = { x: 333, y: 71 };
    const back = worldToScreen(cam, screenToWorld(cam, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('zoomAt mantiene fijo el punto bajo el cursor', () => {
    const cam: Camera = { x: 10, y: -30, zoom: 1 };
    const anchor = { x: 250, y: 400 };
    const before = screenToWorld(cam, anchor);
    const after = screenToWorld(zoomAt(cam, anchor, 3.7), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limita el zoom', () => {
    const cam: Camera = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(cam, { x: 0, y: 0 }, 1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, { x: 0, y: 0 }, 1e-6).zoom).toBe(MIN_ZOOM);
  });

  it('panBy mueve el mundo junto con el puntero', () => {
    const cam: Camera = { x: 0, y: 0, zoom: 2 };
    const world = screenToWorld(cam, { x: 100, y: 100 });
    const moved = panBy(cam, 50, -20);
    const screen = worldToScreen(moved, world);
    expect(screen.x).toBeCloseTo(150);
    expect(screen.y).toBeCloseTo(80);
  });

  it('cameraAt centra el punto pedido', () => {
    const center = cameraCenter(cameraAt({ x: 42, y: -7 }, 0.5, viewport), viewport);
    expect(center.x).toBeCloseTo(42);
    expect(center.y).toBeCloseTo(-7);
  });

  it('fitCamera encuadra el contenido sin pasar del 100 %', () => {
    const small = fitCamera({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, 50);
    expect(small.zoom).toBe(1);
    expect(cameraCenter(small, viewport).x).toBeCloseTo(50);

    const big = fitCamera({ minX: 0, minY: 0, maxX: 7000, maxY: 1000 }, viewport, 50);
    expect(big.zoom).toBeCloseTo(700 / 7000);
  });

  it('interpola el zoom en escala logarítmica', () => {
    const a = cameraAt({ x: 0, y: 0 }, 1, viewport);
    const b = cameraAt({ x: 100, y: 0 }, 4, viewport);
    const mid = interpolateCamera(a, b, 0.5, viewport);
    expect(mid.zoom).toBeCloseTo(2);
    expect(cameraCenter(mid, viewport).x).toBeCloseTo(50);
  });
});
