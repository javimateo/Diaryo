import type { TodayPreview } from '../diary/diary';
import type { DeskView } from '../engine/engine';
import { asRecord, readJSON, writeJSON } from '../lib/saved';

/**
 * What the windows of the desktop app share through the browser (both windows see the
 * same storage and learn about changes with `storage`).
 */

/**
 * The pinned view of the floating diary (center and zoom), the one chosen with "Pin
 * view". The floating diary always opens like that and the desktop desk uses it, so each
 * thing stays in the same place on screen in both. Without a pinned view, the whole book.
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

/** Pins a view. Returns whether it could be saved. */
export const writeDeskView = (view: DeskView) => writeJSON(DESK_VIEW_KEY, view);

/** Is the same thing being shown? (half a pixel of difference doesn't count) */
export function sameView(a: DeskView, b: DeskView): boolean {
  const zoom = Math.abs(a.zoom - b.zoom) / b.zoom < 0.001;
  const moved = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) * b.zoom;
  return zoom && moved < 0.5;
}

/** Today's page for the desktop mini diary (the diary keeps it up to date). */
export const TODAY_KEY = 'diaryo:today';

export interface TodayCard extends TodayPreview {
  /** Cover color. */
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

/**
 * With the whole diary encrypted, today's page isn't written to the local storage (only
 * its cover): the diary's window passes it to the desk's in memory. A window that starts
 * asks for the last one.
 */
type TodayMessage = { type: 'today'; card: TodayCard } | { type: 'ask' };

const todayChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('diaryo-today');
let sharedToday: TodayCard | null = null;
const todayListeners = new Set<(card: TodayCard) => void>();

if (todayChannel) {
  todayChannel.onmessage = ({ data }: MessageEvent<TodayMessage>) => {
    if (data.type === 'ask' && sharedToday) {
      todayChannel.postMessage({ type: 'today', card: sharedToday } satisfies TodayMessage);
    } else if (data.type === 'today') todayListeners.forEach((listener) => listener(data.card));
  };
}

export function shareToday(card: TodayCard) {
  sharedToday = card;
  todayChannel?.postMessage({ type: 'today', card } satisfies TodayMessage);
}

export function onSharedToday(listener: (card: TodayCard) => void): () => void {
  todayListeners.add(listener);
  todayChannel?.postMessage({ type: 'ask' } satisfies TodayMessage);
  return () => todayListeners.delete(listener);
}
