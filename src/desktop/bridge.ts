import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
import { todayKey } from '../lib/dates';
import { serializeDiary } from '../storage/files';
import { useUI } from '../store/ui';
import { readDeskView, writeDeskView, writeToday, type TodayCard } from './saved';
import type { DesktopInfo, DesktopMode } from './settings';
import { call, listen, onDeskChangedElsewhere } from './tauri';

/** Cada cuánto se copia el diario si ha habido cambios (además de al esconderlo o salir). */
const BACKUP_EVERY = 30 * 60 * 1000;
/** Lo que dura el fundido del diario flotante al apartarse (ms; como en el CSS). */
const FADE = 180;
/** Ancho de la imagen del mini diario (el doble de lo que ocupa, para que se vea nítida). */
const TODAY_WIDTH = 640;
/** Espera tras un cambio antes de volver a dibujar el mini diario. */
const TODAY_DELAY = 1200;

/**
 * La ventana del diario en la app de escritorio: su modo (ventana o flotando sobre el
 * escritorio), el fundido al aparecer y apartarse, las copias automáticas, el mini diario
 * del escritorio y los avisos de la parte de escritorio. En la web no se crea.
 */
export class DesktopBridge {
  /** Hay algo que copiar (se ha guardado algo desde la última copia, y al empezar). */
  private dirty = true;
  private backingUp: Promise<void> | null = null;
  /** Se está apartando: si se vuelve a enseñar antes de acabar, ya no se esconde. */
  private closing = false;
  private todayTimer = 0;
  private todayShown = todayKey();
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly diary: Diary,
  ) {}

  /** Conecta la página con la parte de escritorio y enseña la ventana. */
  async start() {
    const info = await call<DesktopInfo>('desktop_info');
    if (this.stopped) return;
    useUI.getState().setDesktop(info);
    this.applyMode(info.mode);

    this.publishToday(0);
    const dayTimer = window.setInterval(() => {
      if (todayKey() !== this.todayShown) this.publishToday(0);
    }, 60 * 1000);
    const backupTimer = window.setInterval(() => void this.backup(), BACKUP_EVERY);
    const unsubscribe = useUI.subscribe((state, previous) => {
      const saving = state.saveStatus === 'saving' && previous.saveStatus !== 'saving';
      if (saving) this.dirty = true;
      if (state.saveStatus === 'saved' && previous.saveStatus === 'saving') this.publishToday();
      if (state.bookStyle !== previous.bookStyle || state.theme !== previous.theme) {
        this.publishToday();
      }
    });
    this.cleanups.push(
      () => window.clearInterval(dayTimer),
      () => window.clearInterval(backupTimer),
      () => window.clearTimeout(this.todayTimer),
      unsubscribe,
    );

    const unlisten = await Promise.all([
      listen<DesktopMode>('diaryo://mode', (mode) => {
        this.applyMode(mode);
        void call('frontend_ready');
      }),
      // La ventana ya se ve: el diario flotante aparece poco a poco.
      listen('diaryo://shown', () => {
        this.closing = false;
        requestAnimationFrame(() => setAway(false));
      }),
      // Apartar el diario flotante (con el atajo o al pasar a otra app): antes, el fundido.
      listen('diaryo://closing', () => void this.hide()),
      // Al esconderse, se copia lo que haya cambiado. El diario flotante vuelve a la vista
      // fijada: se abrirá así la próxima vez.
      listen('diaryo://hidden', () => {
        if (this.mode === 'widget') {
          setAway(true, true);
          this.engine.setTransparentDesk(true, readDeskView());
        }
        void this.backup();
      }),
      // Salir (desde la bandeja): antes, se guarda todo y se copia.
      listen('diaryo://quit', () => void this.quit()),
      // La mesa ha cambiado en el escritorio.
      onDeskChangedElsewhere(() => void this.diary.reloadDesk()),
      // El mini diario del escritorio abre el diario flotante en la página de hoy.
      listen('diaryo://go-today', () => void this.diary.goToToday()),
      // Algo ha cambiado desde fuera de la página (la mesa, con su atajo).
      listen<DesktopInfo>('diaryo://info', (next) => useUI.getState().setDesktop(next)),
    ]);
    this.cleanups.push(...unlisten);
    if (this.stopped) return this.stop();
    // Ya se puede enseñar la ventana (con la página de hoy cargada).
    void call('frontend_ready');
  }

  stop() {
    this.stopped = true;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  private get mode(): DesktopMode | undefined {
    return useUI.getState().desktop?.mode;
  }

  /** Aparta el diario: el flotante, con un fundido antes de esconder la ventana. */
  async hide() {
    if (this.mode !== 'widget') return call('hide_window');
    this.closing = true;
    setAway(true);
    await new Promise((resolve) => window.setTimeout(resolve, FADE));
    if (this.closing) await call('hide_window');
    this.closing = false;
  }

  /** Fija la vista de ahora: el diario flotante se abrirá así y la mesa del escritorio la usará. */
  pinView() {
    const saved = writeDeskView(this.engine.view());
    useUI
      .getState()
      .showToast(
        saved ? 'Vista fijada: el diario se abrirá así' : 'No se ha podido fijar la vista',
      );
  }

  /** Copia del diario de hoy en la carpeta de las copias (si hay cambios, o siempre con `force`). */
  backup(force = false): Promise<void> {
    if (this.backingUp) return this.backingUp;
    if (!useUI.getState().desktop?.backups || (!this.dirty && !force)) return Promise.resolve();
    this.dirty = false;
    this.backingUp = (async () => {
      try {
        await this.diary.flush();
        const contents = serializeDiary(await this.diary.dump());
        await call<string>('write_backup', { day: todayKey(), contents });
        useUI.getState().setDesktop({ lastBackup: Date.now() });
      } catch (error) {
        this.dirty = true;
        console.error('No se ha podido guardar la copia', error);
        useUI.getState().showToast('No se ha podido guardar la copia automática');
      } finally {
        this.backingUp = null;
      }
    })();
    return this.backingUp;
  }

  /** Sale de diaryo después de guardar todo y copiarlo. */
  async quit() {
    await this.diary.flush().catch(() => undefined);
    await this.backup();
    await call('quit_app');
  }

  /** Pone el aspecto del modo: en el widget, la mesa es el escritorio. */
  private applyMode(mode: DesktopMode) {
    document.documentElement.toggleAttribute('data-widget', mode === 'widget');
    // El diario flotante empieza invisible y aparece cuando se enseña la ventana.
    setAway(mode === 'widget', true);
    this.engine.setTransparentDesk(mode === 'widget', readDeskView());
    useUI.getState().setDesktop({ mode });
  }

  /**
   * El mini diario del escritorio: la doble página de hoy, al día (un poco después de
   * cada cambio, al cambiar el aspecto del diario y al empezar un día nuevo).
   */
  private publishToday(delay = TODAY_DELAY) {
    window.clearTimeout(this.todayTimer);
    this.todayTimer = window.setTimeout(async () => {
      try {
        const preview = await this.diary.todayPreview(TODAY_WIDTH);
        this.todayShown = preview.day;
        const card: TodayCard = { ...preview, cover: useUI.getState().bookStyle.cover };
        writeToday(card);
      } catch (error) {
        console.error('No se ha podido preparar el mini diario', error);
      }
    }, delay);
  }
}

/** El diario flotante aún no se ve (o se está apartando): así aparece con un fundido. */
function setAway(away: boolean, instant = false) {
  const root = document.documentElement;
  root.toggleAttribute('data-instant', instant);
  root.toggleAttribute('data-away', away);
  if (!instant) return;
  void root.offsetWidth;
  root.removeAttribute('data-instant');
}

// ─── Para la interfaz ──────────────────────────────────────────

const bridge = () => useUI.getState().desktopBridge;

/** Esconde el diario (sigue en la bandeja, listo para el atajo). */
export const hideDesktop = () => bridge()?.hide() ?? Promise.resolve();

/** Guarda la copia de hoy aunque no haya cambios. */
export async function backupDesktop() {
  await bridge()?.backup(true);
  const { desktop, showToast } = useUI.getState();
  if (desktop?.lastBackup) showToast('Copia guardada');
}

/** Sale de diaryo después de guardar todo y copiarlo. */
export const quitDesktop = () => bridge()?.quit() ?? call('quit_app');

/** Pasa a la ventana o al diario flotante. */
export const showDesktopMode = (mode: DesktopMode) => call('show_mode', { mode });

/** Fija la vista de ahora del diario flotante. */
export const pinDeskView = () => bridge()?.pinView();
