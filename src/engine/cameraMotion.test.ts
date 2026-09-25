import { describe, expect, it } from 'vitest';
import { CameraMotion } from './cameraMotion';

const viewport = { width: 800, height: 600 };
const camera = { x: 0, y: 0, zoom: 1 };

/** Avanza frames de 16 ms hasta que para (o un máximo). */
function run(motion: CameraMotion, from = camera, frames = 500) {
  let current = from;
  let now = 0;
  for (let i = 0; i < frames; i++) {
    now += 16;
    const step = motion.step(current, viewport, now, 16);
    current = step.camera;
    if (!step.moving) return { camera: current, frames: i + 1 };
  }
  return { camera: current, frames };
}

describe('movimiento de la cámara', () => {
  it('sin nada que hacer, no se mueve', () => {
    const step = new CameraMotion().step(camera, viewport, 16, 16);
    expect(step.camera).toBe(camera);
    expect(step.moving).toBe(false);
  });

  it('el zoom suave llega a su objetivo', () => {
    const motion = new CameraMotion();
    motion.zoomTo(2, { x: 400, y: 300 });
    expect(motion.zoomTarget(1)).toBe(2);
    const end = run(motion);
    expect(end.camera.zoom).toBe(2);
    expect(end.frames).toBeGreaterThan(1);
  });

  it('el desplazamiento suave recorre todo lo pedido', () => {
    const motion = new CameraMotion();
    motion.panBy(-100, 0);
    const end = run(motion);
    expect(end.camera.x).toBeCloseTo(100, 5);
  });

  it('la inercia solo arranca con velocidad suficiente y acaba parando', () => {
    const motion = new CameraMotion();
    expect(motion.fling({ x: 0.05, y: 0 })).toBe(false);
    expect(motion.fling({ x: -1, y: 0 })).toBe(true);
    const end = run(motion);
    expect(end.camera.x).toBeGreaterThan(0);
    expect(end.frames).toBeLessThan(500);
  });

  it('un vuelo llega exactamente a su destino', () => {
    const motion = new CameraMotion();
    const to = { x: 300, y: -200, zoom: 0.5 };
    motion.flyTo(camera, to, 0, 320);
    expect(run(motion).camera).toEqual(to);
  });
});
