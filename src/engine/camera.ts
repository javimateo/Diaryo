import type { Bounds } from './geometry';
import { clamp, lerp, type Size, type Vec } from './math';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 40;

/**
 * Canvas camera. `x`, `y` is the world point at the top left corner of the screen; `zoom`
 * is screen pixels per world unit.
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM);

export function screenToWorld(cam: Camera, p: Vec): Vec {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
}

export function worldToScreen(cam: Camera, p: Vec): Vec {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

/** Changes the zoom keeping the world point under `anchor` (screen) fixed. */
export function zoomAt(cam: Camera, anchor: Vec, zoom: number): Camera {
  const z = clampZoom(zoom);
  const w = screenToWorld(cam, anchor);
  return { x: w.x - anchor.x / z, y: w.y - anchor.y / z, zoom: z };
}

/** Moves the camera as if the canvas were dragged `dx`, `dy` screen pixels. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom, zoom: cam.zoom };
}

/** World point at the center of the screen. */
export function cameraCenter(cam: Camera, viewport: Size): Vec {
  return screenToWorld(cam, { x: viewport.width / 2, y: viewport.height / 2 });
}

/** Camera with zoom `zoom` centered on the world point `center`. */
export function cameraAt(center: Vec, zoom: number, viewport: Size): Camera {
  const z = clampZoom(zoom);
  return { x: center.x - viewport.width / 2 / z, y: center.y - viewport.height / 2 / z, zoom: z };
}

/** Camera that frames `bounds` with a margin, without zooming in beyond `maxZoom`. */
export function fitCamera(bounds: Bounds, viewport: Size, padding: number, maxZoom = 1): Camera {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const zoom = Math.min(
    (viewport.width - padding * 2) / width,
    (viewport.height - padding * 2) / height,
    maxZoom,
  );
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  return cameraAt(center, zoom, viewport);
}

/**
 * Interpolates between two cameras. The zoom is interpolated on a logarithmic scale so
 * zooming in and out feel equally fast.
 */
export function interpolateCamera(a: Camera, b: Camera, t: number, viewport: Size): Camera {
  const ca = cameraCenter(a, viewport);
  const cb = cameraCenter(b, viewport);
  const zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t));
  return cameraAt({ x: lerp(ca.x, cb.x, t), y: lerp(ca.y, cb.y, t) }, zoom, viewport);
}
