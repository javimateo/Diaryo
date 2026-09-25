import { interpolateCamera, panBy, zoomAt, type Camera } from './camera';
import { clamp, easeOutCubic, smoothingFactor, type Size, type Vec } from './math';

/** Time constants (ms) of the smoothing. */
const ZOOM_TAU = 55;
const PAN_TAU = 45;
const INERTIA_TAU = 160;
/** Inertia speeds (px/ms): below the minimum it stops; the starting one is needed to begin. */
const INERTIA_MIN_SPEED = 0.02;
const INERTIA_START_SPEED = 0.1;

interface ZoomAnimation {
  target: number;
  anchor: Vec;
}

/** What a one-frame step leaves: the camera and whether it keeps moving. */
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
 * How the camera moves by itself, frame by frame: smooth zoom towards a target (wheel,
 * buttons), smooth wheel panning, inertia on release and animated flights (going to
 * something). It doesn't draw or store the camera: the engine passes the current one each
 * frame and applies the one it returns.
 */
export class CameraMotion {
  private zoom: ZoomAnimation | null = null;
  private pan: Vec = { x: 0, y: 0 };
  private inertia: Vec | null = null;
  private tween: CameraTween | null = null;

  /** Stops any movement in progress. */
  stop() {
    this.inertia = null;
    this.tween = null;
    this.zoom = null;
    this.pan = { x: 0, y: 0 };
  }

  /** Stops the inertia and the flights (the wheel rules from now on). */
  interrupt() {
    this.inertia = null;
    this.tween = null;
  }

  /** The zoom it is heading to (if it is already zooming), to add up consecutive wheel steps. */
  zoomTarget(current: number): number {
    return this.zoom?.target ?? current;
  }

  /** Zooms in or out gradually to `target`, without moving the `anchor` point on screen. */
  zoomTo(target: number, anchor: Vec) {
    this.tween = null;
    this.zoom = { target, anchor };
  }

  /** Forgets the smooth zoom (the zoom is set at once). */
  cancelZoom() {
    this.zoom = null;
  }

  /** Pans gradually (a mouse wheel makes big jumps). */
  panBy(dx: number, dy: number) {
    this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
  }

  /** When released while moving, the canvas keeps sliding a bit. Returns whether it starts. */
  fling(velocity: Vec): boolean {
    if (Math.hypot(velocity.x, velocity.y) <= INERTIA_START_SPEED) return false;
    this.inertia = velocity;
    return true;
  }

  /** Flies from one camera to another. */
  flyTo(from: Camera, to: Camera, now: number, duration: number) {
    this.stop();
    this.tween = { from, to, start: now, duration };
  }

  /**
   * Advances one frame. Returns the resulting camera (the same one if it doesn't move)
   * and whether more frames are needed.
   */
  step(camera: Camera, viewport: Size, now: number, dt: number) {
    let current = camera;
    let moving = false;
    // They all advance each frame, one after another on the camera left by the previous
    // one.
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
