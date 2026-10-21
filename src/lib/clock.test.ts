import { describe, expect, it } from 'vitest';
import { noteServerTime, now } from './clock';

describe('clock', () => {
  it('follows the server when this clock is off, and ignores the network delay', () => {
    const local = Date.now();
    noteServerTime(local + 800, local);
    expect(Math.abs(now() - Date.now())).toBeLessThan(100);
    // This device is an hour behind.
    noteServerTime(local + 3_600_000, local);
    expect(Math.round((now() - Date.now()) / 1000)).toBe(3600);
    // Back in time with the server.
    noteServerTime(local + 500, local);
    expect(Math.abs(now() - Date.now())).toBeLessThan(100);
  });
});
