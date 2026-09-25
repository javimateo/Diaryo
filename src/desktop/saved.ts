import type { TodayPreview } from '../diary/diary';
import type { DeskView } from '../engine/engine';
import { asRecord, readJSON, writeJSON } from '../lib/saved';

/**
 * Lo que comparten las ventanas de la app de escritorio a través del navegador (las dos
 * ventanas ven el mismo almacenamiento y se enteran de los cambios con `storage`).
 */

/**
 * La vista fijada del diario flotante (centro y zoom), la que se elige con "Fijar vista".
 * El diario flotante se abre siempre así y la mesa del escritorio la usa, para que cada
 * cosa quede en el mismo sitio de la pantalla en los dos. Sin fijar, el libro entero.
 */
export const DESK_VIEW_KEY = 'diaryo:desk-view';

export function readDeskView(): DeskView | null {
  const { center, zoom } = asRecord(readJSON(DESK_VIEW_KEY));
  const { x, y } = asRecord(center);
  const ok =
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    typeof zoom === 'number' &&
    zoom > 0;
  return ok ? { center: { x, y }, zoom } : null;
}

/** Fija una vista. Devuelve si se ha podido guardar. */
export const writeDeskView = (view: DeskView) => writeJSON(DESK_VIEW_KEY, view);

/** ¿Se está viendo lo mismo? (medio píxel de diferencia no cuenta) */
export function sameView(a: DeskView, b: DeskView): boolean {
  const zoom = Math.abs(a.zoom - b.zoom) / b.zoom < 0.001;
  const moved = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) * b.zoom;
  return zoom && moved < 0.5;
}

/** La página de hoy para el mini diario del escritorio (la pone al día el diario). */
export const TODAY_KEY = 'diaryo:today';

export interface TodayCard extends TodayPreview {
  /** Color de las tapas. */
  cover: string;
}

export function readToday(): TodayCard | null {
  const { day, image, pending, cover } = asRecord(readJSON(TODAY_KEY));
  const ok =
    typeof day === 'string' &&
    typeof image === 'string' &&
    typeof pending === 'number' &&
    typeof cover === 'string';
  return ok ? { day, image, pending, cover } : null;
}

export const writeToday = (card: TodayCard) => writeJSON(TODAY_KEY, card);
