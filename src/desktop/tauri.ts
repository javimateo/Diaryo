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

/**
 * Saves a file where the user chooses (the system's "Save as" dialog): the window doesn't
 * download files. Its bytes go raw, not as JSON, so a big copy of the diary stays fast.
 * Returns where it went, or null if the user cancelled.
 */
export async function saveFileAs(blob: Blob, name: string): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<string | null>('save_file', bytes, { headers: { 'x-file-name': name } });
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

/** The installed version (e.g. "0.2.0"). */
export async function appVersion() {
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
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
