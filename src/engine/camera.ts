import type { Bounds } from './geometry';
import { clamp, lerp, type Size, type Vec } from './math';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 40;

/**
 * Cámara del lienzo. `x`, `y` es el punto del mundo que queda en la esquina
 * superior izquierda de la pantalla; `zoom` son píxeles de pantalla por unidad
 * del mundo.
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

/** Cambia el zoom manteniendo fijo el punto del mundo que está bajo `anchor` (pantalla). */
export function zoomAt(cam: Camera, anchor: Vec, zoom: number): Camera {
  const z = clampZoom(zoom);
  const w = screenToWorld(cam, anchor);
  return { x: w.x - anchor.x / z, y: w.y - anchor.y / z, zoom: z };
}

/** Desplaza la cámara como si arrastrásemos el lienzo `dx`, `dy` píxeles de pantalla. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom, zoom: cam.zoom };
}

/** Punto del mundo en el centro de la pantalla. */
export function cameraCenter(cam: Camera, viewport: Size): Vec {
  return screenToWorld(cam, { x: viewport.width / 2, y: viewport.height / 2 });
}

/** Cámara con zoom `zoom` centrada en el punto del mundo `center`. */
export function cameraAt(center: Vec, zoom: number, viewport: Size): Camera {
  const z = clampZoom(zoom);
  return { x: center.x - viewport.width / 2 / z, y: center.y - viewport.height / 2 / z, zoom: z };
}

/** Cámara que encuadra `bounds` con un margen, sin acercarse más de `maxZoom`. */
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
 * Interpola entre dos cámaras. El zoom se interpola en escala logarítmica para
 * que acercarse y alejarse se sientan igual de rápidos.
 */
export function interpolateCamera(a: Camera, b: Camera, t: number, viewport: Size): Camera {
  const ca = cameraCenter(a, viewport);
  const cb = cameraCenter(b, viewport);
  const zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t));
  return cameraAt({ x: lerp(ca.x, cb.x, t), y: lerp(ca.y, cb.y, t) }, zoom, viewport);
}
