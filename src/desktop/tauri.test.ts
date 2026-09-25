import { describe, expect, it, vi } from 'vitest';

// An in-memory message bus instead of Tauri's (it reaches every window, also the one
// sending).
const handlers = new Map<string, ((e: { payload: unknown }) => void)[]>();
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, handler: (e: { payload: unknown }) => void) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    return () =>
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== handler),
      );
  },
  emit: async (event: string, payload: unknown) => {
    (handlers.get(event) ?? []).forEach((handler) => handler({ payload }));
  },
}));

const { DESK_CHANGED, notifyDeskSaved, onDeskChangedElsewhere } = await import('./tauri');

describe('desk messages between windows', () => {
  it("each window only listens to the other windows' messages", async () => {
    let changes = 0;
    const stop = await onDeskChangedElsewhere(() => changes++);
    // The window itself tells: what it just saved isn't loaded again.
    await notifyDeskSaved();
    expect(changes).toBe(0);
    // Another window tells (with another id).
    handlers.get(DESK_CHANGED)?.forEach((handler) => handler({ payload: 'otra-ventana' }));
    expect(changes).toBe(1);
    stop();
    handlers.get(DESK_CHANGED)?.forEach((handler) => handler({ payload: 'otra-ventana' }));
    expect(changes).toBe(1);
  });
});
