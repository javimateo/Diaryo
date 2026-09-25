import { interpolateCamera, panBy, zoomAt, type Camera } from './camera';
import { clamp, easeOutCubic, smoothingFactor, type Size, type Vec } from './math';

/** Constantes de tiempo (ms) de los suavizados. */
const ZOOM_TAU = 55;
const PAN_TAU = 45;
const INERTIA_TAU = 160;
/** Velocidades de la inercia (px/ms): por debajo de la mínima se para; hace falta la de salida para empezar. */
const INERTIA_MIN_SPEED = 0.02;
const INERTIA_START_SPEED = 0.1;

interface ZoomAnimation {
  target: number;
  anchor: Vec;
}

/** Lo que deja un paso de un frame: la cámara y si sigue moviéndose. */
interface Step {
  camera: Camera;
  moving: boolean;
}

interface CameraTween {
  from: Camera;
  to: Camera;
  start: number;
  duration: number;
}

/**
 * Cómo se mueve la cámara sola, frame a frame: el zoom suave hacia un objetivo (rueda,
 * botones), el desplazamiento suave de la rueda, la inercia al soltar y los vuelos
 * animados (ir a algo). No dibuja ni guarda la cámara: el motor le pasa la de ahora en
 * cada frame y aplica la que devuelve.
 */
export class CameraMotion {
  private zoom: ZoomAnimation | null = null;
  private pan: Vec = { x: 0, y: 0 };
  private inertia: Vec | null = null;
  private tween: CameraTween | null = null;

  /** Para todo movimiento en curso. */
  stop() {
    this.inertia = null;
    this.tween = null;
    this.zoom = null;
    this.pan = { x: 0, y: 0 };
  }

  /** Para la inercia y los vuelos (la rueda manda a partir de ahora). */
  interrupt() {
    this.inertia = null;
    this.tween = null;
  }

  /** El zoom al que se va (si ya se está acercando), para sumar pasos de rueda seguidos. */
  zoomTarget(current: number): number {
    return this.zoom?.target ?? current;
  }

  /** Acerca o aleja poco a poco hasta `target`, sin mover el punto `anchor` de la pantalla. */
  zoomTo(target: number, anchor: Vec) {
    this.tween = null;
    this.zoom = { target, anchor };
  }

  /** Olvida el zoom suave (el zoom se pone de golpe). */
  cancelZoom() {
    this.zoom = null;
  }

  /** Desplaza poco a poco (la rueda de ratón da saltos grandes). */
  panBy(dx: number, dy: number) {
    this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
  }

  /** Al soltar en movimiento, el lienzo sigue deslizándose un poco. Devuelve si arranca. */
  fling(velocity: Vec): boolean {
    if (Math.hypot(velocity.x, velocity.y) <= INERTIA_START_SPEED) return false;
    this.inertia = velocity;
    return true;
  }

  /** Vuela de una cámara a otra. */
  flyTo(from: Camera, to: Camera, now: number, duration: number) {
    this.stop();
    this.tween = { from, to, start: now, duration };
  }

  /**
   * Avanza un frame. Devuelve la cámara resultante (la misma si no se mueve) y si hay
   * que seguir pidiendo frames.
   */
  step(camera: Camera, viewport: Size, now: number, dt: number) {
    let current = camera;
    let moving = false;
    // Todas avanzan en cada frame, una tras otra sobre la cámara que deja la anterior.
    const steps = [
      () => this.stepTween(now, viewport),
      () => this.stepZoom(current, dt),
      () => this.stepPan(current, dt),
      () => this.stepInertia(current, dt),
    ];
    for (const step of steps) {
      const result = step();
      if (!result) continue;
      current = result.camera;
      moving ||= result.moving;
    }
    return { camera: current, moving };
  }

  private stepTween(now: number, viewport: Size): Step | null {
    if (!this.tween) return null;
    const { from, to, start, duration } = this.tween;
    const t = clamp((now - start) / duration, 0, 1);
    if (t >= 1) this.tween = null;
    return { camera: interpolateCamera(from, to, easeOutCubic(t), viewport), moving: t < 1 };
  }

  private stepZoom(camera: Camera, dt: number): Step | null {
    if (!this.zoom) return null;
    const { target, anchor } = this.zoom;
    const current = Math.log(camera.zoom);
    const goal = Math.log(target);
    const done = Math.abs(goal - current) < 0.001;
    const zoom = done
      ? target
      : Math.exp(current + (goal - current) * smoothingFactor(dt, ZOOM_TAU));
    if (done) this.zoom = null;
    return { camera: zoomAt(camera, anchor, zoom), moving: !done };
  }

  private stepPan(camera: Camera, dt: number): Step | null {
    const { x, y } = this.pan;
    if (x === 0 && y === 0) return null;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
      this.pan = { x: 0, y: 0 };
      return { camera: panBy(camera, x, y), moving: false };
    }
    const k = smoothingFactor(dt, PAN_TAU);
    this.pan = { x: x - x * k, y: y - y * k };
    return { camera: panBy(camera, x * k, y * k), moving: true };
  }

  private stepInertia(camera: Camera, dt: number): Step | null {
    const v = this.inertia;
    if (!v) return null;
    const decay = Math.exp(-dt / INERTIA_TAU);
    this.inertia = { x: v.x * decay, y: v.y * decay };
    const moving = Math.hypot(this.inertia.x, this.inertia.y) > INERTIA_MIN_SPEED;
    if (!moving) this.inertia = null;
    return { camera: panBy(camera, v.x * dt, v.y * dt), moving };
  }
}
