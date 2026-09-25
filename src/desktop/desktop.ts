import { todayKey } from '../diary/dates';
import type { Diary, TodayPreview } from '../diary/diary';
import type { DeskView, Engine } from '../engine/engine';
import { serializeDiary } from '../storage/files';
import { useUI } from '../store/ui';

/**
 * La app de escritorio (Tauri): el diario en su ventana o flotando sobre el escritorio,
 * con un atajo global, icono en la bandeja y copias automáticas en una carpeta. En la
 * web nada de esto se carga.
 */

/** ¿Es la app de escritorio? */
export const isDesktop = () => '__TAURI_INTERNALS__' in window;

/** En su ventana o flotando sobre el escritorio (el widget). */
export type DesktopMode = 'window' | 'widget';

/** Lo que cuenta la parte de escritorio. */
export interface DesktopInfo {
  mode: DesktopMode;
  /** Atajo global del diario flotante ("Ctrl+Alt+D"). */
  shortcut: string;
  /** El atajo funciona (si no, otra app lo tiene cogido). */
  shortcutOk: boolean;
  autostart: boolean;
  backups: boolean;
  backupDir: string;
  /** La mesa en el escritorio de Windows. */
  deskLayer: boolean;
  /** Atajo que la enseña o la esconde ("Ctrl+Alt+N"). */
  deskShortcut: string;
  deskShortcutOk: boolean;
  /** Cuándo se hizo la última copia en esta sesión. */
  lastBackup?: number;
}

export async function call<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** La mesa ha cambiado (en el diario o en la capa del escritorio): las otras ventanas se ponen al día. */
export const DESK_CHANGED = 'diaryo://desk-changed';
/** Quién avisa (cada ventana hace caso solo de los avisos de las demás). */
export const WINDOW_ID = crypto.randomUUID();

/** Avisa a las otras ventanas de que se ha guardado la mesa. */
export async function notifyDeskSaved() {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(DESK_CHANGED, WINDOW_ID);
}

/** Cada cuánto se copia el diario si ha habido cambios (además de al esconderlo o salir). */
const BACKUP_EVERY = 30 * 60 * 1000;

/** Copia del diario de hoy (la pone `startDesktop`). */
let backupNow: (force?: boolean) => Promise<void> = async () => {};

/**
 * La vista fijada del diario flotante (centro y zoom), la que se elige con "Fijar vista".
 * El diario flotante se abre siempre así y la mesa del escritorio la usa, para que cada
 * cosa quede en el mismo sitio de la pantalla en los dos. Sin fijar, el libro entero.
 */
export const DESK_VIEW_KEY = 'diaryo:desk-view';

export function readDeskView(): DeskView | null {
  try {
    const view = JSON.parse(localStorage.getItem(DESK_VIEW_KEY) ?? 'null') as DeskView | null;
    const ok =
      view && Number.isFinite(view.center?.x) && Number.isFinite(view.center?.y) && view.zoom > 0;
    return ok ? view : null;
  } catch {
    return null;
  }
}

/** La página de hoy para el mini diario del escritorio (la pone al día el diario). */
export const TODAY_KEY = 'diaryo:today';

export interface TodayCard extends TodayPreview {
  /** Color de las tapas. */
  cover: string;
}

export function readToday(): TodayCard | null {
  try {
    const card = JSON.parse(localStorage.getItem(TODAY_KEY) ?? 'null') as TodayCard | null;
    return card && typeof card.image === 'string' ? card : null;
  } catch {
    return null;
  }
}

/** Ancho de la imagen del mini diario (el doble de lo que ocupa, para que se vea nítida). */
const TODAY_WIDTH = 640;

/** Fija la vista de ahora: el diario flotante se abrirá así y la mesa del escritorio la usará. */
export function pinDeskView(view: DeskView) {
  try {
    localStorage.setItem(DESK_VIEW_KEY, JSON.stringify(view));
  } catch {
    useUI.getState().showToast('No se ha podido fijar la vista');
    return;
  }
  useUI.getState().showToast('Vista fijada: el diario se abrirá así');
}

/** ¿Se está viendo lo mismo? (medio píxel de diferencia no cuenta) */
export function sameView(a: DeskView, b: DeskView): boolean {
  const zoom = Math.abs(a.zoom - b.zoom) / b.zoom < 0.001;
  const moved = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) * b.zoom;
  return zoom && moved < 0.5;
}

/** Lo que dura el fundido del diario flotante al apartarse (ms; como en el CSS). */
const FADE = 180;

/** El diario flotante aún no se ve (o se está apartando): así aparece con un fundido. */
function setAway(away: boolean, instant = false) {
  const root = document.documentElement;
  root.toggleAttribute('data-instant', instant);
  root.toggleAttribute('data-away', away);
  if (!instant) return;
  void root.offsetWidth;
  root.removeAttribute('data-instant');
}

/** Se está apartando: si se vuelve a enseñar antes de acabar, ya no se esconde. */
let closing = false;

/** Aparta el diario flotante con un fundido y luego esconde la ventana. */
async function fadeOutAndHide() {
  closing = true;
  setAway(true);
  await new Promise((resolve) => window.setTimeout(resolve, FADE));
  if (closing) await call('hide_window');
  closing = false;
}

/** Pone el aspecto del modo: en el widget, la mesa es el escritorio. */
function applyMode(engine: Engine, mode: DesktopMode) {
  document.documentElement.toggleAttribute('data-widget', mode === 'widget');
  // El diario flotante empieza invisible y aparece cuando se enseña la ventana.
  setAway(mode === 'widget', true);
  engine.setTransparentDesk(mode === 'widget', readDeskView());
  useUI.getState().setDesktop({ mode });
}

/** Conecta la página con la parte de escritorio. Devuelve cómo desconectarla. */
export async function startDesktop(engine: Engine, diary: Diary): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const info = await call<DesktopInfo>('desktop_info');
  useUI.getState().setDesktop(info);
  applyMode(engine, info.mode);

  // El mini diario del escritorio: la doble página de hoy, al día (un poco después de
  // cada cambio, al cambiar el aspecto del diario y al empezar un día nuevo).
  let todayTimer = 0;
  let todayShown = todayKey();
  const publishToday = (delay = 1200) => {
    window.clearTimeout(todayTimer);
    todayTimer = window.setTimeout(async () => {
      try {
        const preview = await diary.todayPreview(TODAY_WIDTH);
        todayShown = preview.day;
        const card: TodayCard = { ...preview, cover: useUI.getState().bookStyle.cover };
        localStorage.setItem(TODAY_KEY, JSON.stringify(card));
      } catch (error) {
        console.error('No se ha podido preparar el mini diario', error);
      }
    }, delay);
  };
  const dayTimer = window.setInterval(() => {
    if (todayKey() !== todayShown) publishToday(0);
  }, 60 * 1000);
  publishToday(0);

  // Hay algo que copiar si se ha guardado algo desde la última copia (y al empezar).
  let dirty = true;
  const unsubscribe = useUI.subscribe((state, previous) => {
    if (state.saveStatus === 'saving' && previous.saveStatus !== 'saving') dirty = true;
    if (state.saveStatus === 'saved' && previous.saveStatus === 'saving') publishToday();
    if (state.bookStyle !== previous.bookStyle || state.theme !== previous.theme) publishToday();
  });

  let running: Promise<void> | null = null;
  backupNow = (force = false) => {
    if (running) return running;
    if (!useUI.getState().desktop?.backups || (!dirty && !force)) return Promise.resolve();
    dirty = false;
    running = (async () => {
      try {
        await diary.flush();
        const contents = serializeDiary(await diary.dump());
        await call<string>('write_backup', { day: todayKey(), contents });
        useUI.getState().setDesktop({ lastBackup: Date.now() });
      } catch (error) {
        dirty = true;
        console.error('No se ha podido guardar la copia', error);
        useUI.getState().showToast('No se ha podido guardar la copia automática');
      } finally {
        running = null;
      }
    })();
    return running;
  };

  const unlisten = await Promise.all([
    listen<DesktopMode>('diaryo://mode', (event) => {
      applyMode(engine, event.payload);
      void call('frontend_ready');
    }),
    // Al esconderse, se copia lo que haya cambiado. El diario flotante vuelve a la vista
    // fijada: se abrirá así la próxima vez.
    listen('diaryo://hidden', () => {
      if (useUI.getState().desktop?.mode === 'widget') {
        setAway(true, true);
        engine.setTransparentDesk(true, readDeskView());
      }
      void backupNow();
    }),
    // La ventana ya se ve: el diario flotante aparece poco a poco.
    listen('diaryo://shown', () => {
      closing = false;
      requestAnimationFrame(() => setAway(false));
    }),
    // Apartar el diario flotante (con el atajo o al pasar a otra app): antes, el fundido.
    listen('diaryo://closing', () => void fadeOutAndHide()),
    // Salir (desde la bandeja): antes, se guarda todo y se copia.
    listen('diaryo://quit', () => void quitDesktop()),
    // La mesa ha cambiado en el escritorio.
    listen<string>(DESK_CHANGED, (event) => {
      if (event.payload !== WINDOW_ID) void diary.reloadDesk();
    }),
    // El mini diario del escritorio abre el diario flotante en la página de hoy.
    listen('diaryo://go-today', () => void diary.goToToday()),
    // Algo ha cambiado desde fuera de la página (la mesa, con su atajo).
    listen<DesktopInfo>('diaryo://info', (event) => useUI.getState().setDesktop(event.payload)),
  ]);
  const timer = window.setInterval(() => void backupNow(), BACKUP_EVERY);
  // Ya se puede enseñar la ventana (con la página de hoy cargada).
  void call('frontend_ready');

  return () => {
    unlisten.forEach((stop) => stop());
    window.clearInterval(timer);
    window.clearTimeout(todayTimer);
    window.clearInterval(dayTimer);
    unsubscribe();
    backupNow = async () => {};
  };
}

/** Guarda la copia de hoy aunque no haya cambios. */
export async function backupDesktop() {
  await backupNow(true);
  const { desktop, showToast } = useUI.getState();
  if (desktop?.lastBackup) showToast('Copia guardada');
}

/** Sale de diaryo después de guardar todo y copiarlo. */
export async function quitDesktop() {
  await useUI
    .getState()
    .diary?.flush()
    .catch(() => undefined);
  await backupNow();
  await call('quit_app');
}

/** Esconde el diario (sigue en la bandeja, listo para el atajo). */
export const hideDesktop = () =>
  useUI.getState().desktop?.mode === 'widget' ? fadeOutAndHide() : call('hide_window');

/** Pasa a la ventana o al diario flotante. */
export const showDesktopMode = (mode: DesktopMode) => call('show_mode', { mode });

/** Los ajustes de escritorio devuelven cómo quedan (o el motivo si no se pudo). */
async function updateInfo(command: string, args?: Record<string, unknown>) {
  const { setDesktop, showToast } = useUI.getState();
  try {
    setDesktop(await call<DesktopInfo>(command, args));
  } catch (error) {
    showToast(String(error));
  }
}

export const setDesktopShortcut = (shortcut: string) => updateInfo('set_shortcut', { shortcut });
export const setAutostart = (enabled: boolean) => updateInfo('set_autostart', { enabled });
export const setBackups = (enabled: boolean) => updateInfo('set_backups', { enabled });
export const setDeskLayer = (enabled: boolean) => updateInfo('set_desk_layer', { enabled });
export const setDeskShortcut = (shortcut: string) => updateInfo('set_desk_shortcut', { shortcut });
export const chooseBackupDir = () => updateInfo('choose_backup_dir');
export const openBackupDir = () =>
  call('open_backup_dir').catch((error) => useUI.getState().showToast(String(error)));

const KEY_NAMES: Record<string, string> = { Space: 'Espacio' };

/** Cómo se enseña cada tecla de un atajo ("Ctrl+Alt+D" → Ctrl, Alt, D). */
export const shortcutKeys = (shortcut: string) =>
  shortcut.split('+').map((key) => KEY_NAMES[key] ?? key);

/**
 * El atajo de una pulsación de teclado ("Ctrl+Alt+D"), o null si aún no vale: tiene
 * que llevar Ctrl o Alt (si no, taparía teclas normales) y una letra, un número, una
 * tecla de función o el espacio.
 */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const key = /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3)
    : /^Digit\d$/.test(e.code)
      ? e.code.slice(5)
      : /^F\d{1,2}$/.test(e.code) || e.code === 'Space'
        ? e.code
        : null;
  if (!key || (!e.ctrlKey && !e.altKey)) return null;
  const modifiers = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'];
  return [...modifiers.filter(Boolean), key].join('+');
}
