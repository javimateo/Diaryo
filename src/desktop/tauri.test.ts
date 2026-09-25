import { describe, expect, it, vi } from 'vitest';

// Un bus de avisos en memoria en lugar del de Tauri (llega a todas las ventanas, también a la que avisa).
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

describe('avisos de la mesa entre ventanas', () => {
  it('cada ventana hace caso solo de los avisos de las demás', async () => {
    let changes = 0;
    const stop = await onDeskChangedElsewhere(() => changes++);
    // La propia ventana avisa: no se vuelve a cargar lo que acaba de guardar.
    await notifyDeskSaved();
    expect(changes).toBe(0);
    // Otra ventana avisa (con otro id).
    handlers.get(DESK_CHANGED)?.forEach((handler) => handler({ payload: 'otra-ventana' }));
    expect(changes).toBe(1);
    stop();
    handlers.get(DESK_CHANGED)?.forEach((handler) => handler({ payload: 'otra-ventana' }));
    expect(changes).toBe(1);
  });
});
