export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Rotates vector `v` by `angle` (radians, clockwise on screen). */
export function rotateVec(v: Vec, angle: number): Vec {
  if (angle === 0) return v;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** Rotates point `p` around `center`. */
export function rotateAround(p: Vec, center: Vec, angle: number): Vec {
  const r = rotateVec({ x: p.x - center.x, y: p.y - center.y }, angle);
  return { x: center.x + r.x, y: center.y + r.y };
}

/** Normalizes an angle to (-π, π]. */
export function normalizeAngle(angle: number): number {
  const a = angle % (Math.PI * 2);
  if (a > Math.PI) return a - Math.PI * 2;
  if (a <= -Math.PI) return a + Math.PI * 2;
  return a;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * FPS-independent smoothing factor: what fraction of the way to cover in `dt` ms with a
 * time constant of `tau` ms.
 */
export const smoothingFactor = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
