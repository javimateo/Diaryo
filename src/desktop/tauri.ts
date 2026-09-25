/**
 * What talks to the desktop side (Tauri). On the web none of this is loaded: the Tauri
 * modules are imported only when needed.
 */

/** Is it the desktop app? */
export const isDesktop = () => '__TAURI_INTERNALS__' in window;

/** Calls a command of the desktop side (in Rust). */
export async function call<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Listens to a message from the desktop side or from another window. Returns how to stop. */
export async function listen<T>(event: string, handler: (payload: T) => void) {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (e) => handler(e.payload));
}

/** Tells every window (this one too). */
export async function emit(event: string, payload?: unknown) {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(event, payload);
}

/** This window (to move it, maximize it…). */
export async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/** The desk changed (in the diary or in the desktop layer): the other windows catch up. */
export const DESK_CHANGED = 'diaryo://desk-changed';
/** Who is telling (each window only listens to the other windows' messages). */
export const WINDOW_ID = crypto.randomUUID();

/** Tells the other windows that the desk was saved. */
export const notifyDeskSaved = () => emit(DESK_CHANGED, WINDOW_ID);

/** Listens to desk changes made in other windows. */
export const onDeskChangedElsewhere = (handler: () => void) =>
  listen<string>(DESK_CHANGED, (from) => {
    if (from !== WINDOW_ID) handler();
  });
