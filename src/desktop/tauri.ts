/**
 * Lo que habla con la parte de escritorio (Tauri). En la web nada de esto se carga: los
 * módulos de Tauri se importan solo cuando hacen falta.
 */

/** ¿Es la app de escritorio? */
export const isDesktop = () => '__TAURI_INTERNALS__' in window;

/** Llama a un comando de la parte de escritorio (en Rust). */
export async function call<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Escucha un aviso de la parte de escritorio o de otra ventana. Devuelve cómo dejar de hacerlo. */
export async function listen<T>(event: string, handler: (payload: T) => void) {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (e) => handler(e.payload));
}

/** Avisa a todas las ventanas (también a esta). */
export async function emit(event: string, payload?: unknown) {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(event, payload);
}

/** Esta ventana (para moverla, maximizarla…). */
export async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/** La mesa ha cambiado (en el diario o en la capa del escritorio): las otras ventanas se ponen al día. */
export const DESK_CHANGED = 'diaryo://desk-changed';
/** Quién avisa (cada ventana hace caso solo de los avisos de las demás). */
export const WINDOW_ID = crypto.randomUUID();

/** Avisa a las otras ventanas de que se ha guardado la mesa. */
export const notifyDeskSaved = () => emit(DESK_CHANGED, WINDOW_ID);

/** Escucha los cambios de la mesa hechos en otras ventanas. */
export const onDeskChangedElsewhere = (handler: () => void) =>
  listen<string>(DESK_CHANGED, (from) => {
    if (from !== WINDOW_ID) handler();
  });
