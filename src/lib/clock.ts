import { readText, writeText } from './saved';

/**
 * The time changes are stamped with (which decides which change wins when two devices
 * touch the same thing). It is this device's clock corrected with the cloud server's, so
 * a clock that is minutes or days off doesn't win (or lose) every conflict.
 */
const OFFSET_KEY = 'diaryo:clock-offset';
/** Differences smaller than this are the network's delay, not the clock's. */
const TOLERANCE = 2000;

let offset = Number(readText(OFFSET_KEY)) || 0;

/** Now, in the server's time (ms). */
export const now = () => Date.now() + offset;

/** The server answered with its time (ms): this device's clock is corrected if it is off. */
export function noteServerTime(serverTime: number, local = Date.now()) {
  if (!Number.isFinite(serverTime)) return;
  const measured = serverTime - local;
  if (Math.abs(measured - offset) < TOLERANCE) return;
  offset = Math.abs(measured) < TOLERANCE ? 0 : measured;
  writeText(OFFSET_KEY, String(offset));
}
