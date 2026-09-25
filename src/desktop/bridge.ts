import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
import { todayKey } from '../lib/dates';
import { serializeDiary } from '../storage/files';
import { useUI } from '../store/ui';
import { readDeskView, writeDeskView, writeToday, type TodayCard } from './saved';
import type { DesktopInfo, DesktopMode } from './settings';
import { call, listen, onDeskChangedElsewhere } from './tauri';
import { t } from '../i18n';

/** How often the diary is backed up if there were changes (besides when hiding it or quitting). */
const BACKUP_EVERY = 30 * 60 * 1000;
/** How long the floating diary takes to fade away (ms; as in the CSS). */
const FADE = 180;
/** Width of the mini diary image (twice what it takes up, so it looks sharp). */
const TODAY_WIDTH = 640;
/** Wait after a change before drawing the mini diary again. */
const TODAY_DELAY = 1200;

/**
 * The diary window in the desktop app: its mode (window or floating over the desktop),
 * the fade when appearing and going away, the automatic backups, the desktop mini diary
 * and the messages from the desktop side. It isn't created on the web.
 */
export class DesktopBridge {
  /**
   * There is something to back up (something was saved since the last backup, and at the
   * start).
   */
  private dirty = true;
  private backingUp: Promise<void> | null = null;
  /** It is going away: if it is shown again before finishing, it isn't hidden. */
  private closing = false;
  private todayTimer = 0;
  private todayShown = todayKey();
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly diary: Diary,
  ) {}

  /** Connects the page with the desktop side and shows the window. */
  async start() {
    const info = await call<DesktopInfo>('desktop_info');
    if (this.stopped) return;
    useUI.getState().setDesktop(info);
    this.applyMode(info.mode);
    // The texts of the desktop side (the tray, the errors), in the same language.
    void call('set_language', { language: useUI.getState().settings.language });

    this.publishToday(0);
    const dayTimer = window.setInterval(() => {
      if (todayKey() !== this.todayShown) this.publishToday(0);
    }, 60 * 1000);
    const backupTimer = window.setInterval(() => void this.backup(), BACKUP_EVERY);
    const unsubscribe = useUI.subscribe((state, previous) => {
      const saving = state.saveStatus === 'saving' && previous.saveStatus !== 'saving';
      if (saving) this.dirty = true;
      if (state.saveStatus === 'saved' && previous.saveStatus === 'saving') this.publishToday();
      const language = state.settings.language !== previous.settings.language;
      if (language) void call('set_language', { language: state.settings.language });
      if (state.bookStyle !== previous.bookStyle || state.theme !== previous.theme || language) {
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
      // The window is already visible: the floating diary fades in.
      listen('diaryo://shown', () => {
        this.closing = false;
        requestAnimationFrame(() => setAway(false));
      }),
      // Put the floating diary away (with the shortcut or when switching to another app):
      // first, the fade.
      listen('diaryo://closing', () => void this.hide()),
      // When hidden, whatever changed is backed up. The floating diary goes back to the
      // pinned view: it will open like that next time.
      listen('diaryo://hidden', () => {
        if (this.mode === 'widget') {
          setAway(true, true);
          this.engine.setTransparentDesk(true, readDeskView());
        }
        void this.backup();
      }),
      // Quit (from the tray): first, everything is saved and backed up.
      listen('diaryo://quit', () => void this.quit()),
      // The desk changed on the desktop.
      onDeskChangedElsewhere(() => void this.diary.reloadDesk()),
      // The desktop mini diary opens the floating diary on today's page.
      listen('diaryo://go-today', () => void this.diary.goToToday()),
      // Something changed from outside the page (the desk, with its shortcut).
      listen<DesktopInfo>('diaryo://info', (next) => useUI.getState().setDesktop(next)),
    ]);
    this.cleanups.push(...unlisten);
    if (this.stopped) return this.stop();
    // The window can be shown now (with today's page loaded).
    void call('frontend_ready');
  }

  stop() {
    this.stopped = true;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  private get mode(): DesktopMode | undefined {
    return useUI.getState().desktop?.mode;
  }

  /** Puts the diary away: the floating one, with a fade before hiding the window. */
  async hide() {
    if (this.mode !== 'widget') return call('hide_window');
    this.closing = true;
    setAway(true);
    await new Promise((resolve) => window.setTimeout(resolve, FADE));
    if (this.closing) await call('hide_window');
    this.closing = false;
  }

  /**
   * Pins the current view: the floating diary will open like this and the desktop desk
   * will use it.
   */
  pinView() {
    const saved = writeDeskView(this.engine.view());
    useUI.getState().showToast(saved ? t().view.pinDone : t().view.pinFailed);
  }

  /**
   * Backup of today's diary in the backups folder (if there are changes, or always with
   * `force`).
   */
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
        console.error("Couldn't save the backup", error);
        useUI.getState().showToast(t().desktop.backupFailed);
      } finally {
        this.backingUp = null;
      }
    })();
    return this.backingUp;
  }

  /** Quits diaryo after saving and backing up everything. */
  async quit() {
    await this.diary.flush().catch(() => undefined);
    await this.backup();
    await call('quit_app');
  }

  /** Applies the look of the mode: in the widget, the desk is the desktop. */
  private applyMode(mode: DesktopMode) {
    document.documentElement.toggleAttribute('data-widget', mode === 'widget');
    // The floating diary starts invisible and fades in when the window is shown.
    setAway(mode === 'widget', true);
    this.engine.setTransparentDesk(mode === 'widget', readDeskView());
    useUI.getState().setDesktop({ mode });
  }

  /**
   * The desktop mini diary: today's double page, up to date (shortly after each change,
   * when the diary look changes and when a new day starts).
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
        console.error("Couldn't prepare the mini diary", error);
      }
    }, delay);
  }
}

/** The floating diary isn't visible yet (or is going away): that way it fades in. */
function setAway(away: boolean, instant = false) {
  const root = document.documentElement;
  root.toggleAttribute('data-instant', instant);
  root.toggleAttribute('data-away', away);
  if (!instant) return;
  void root.offsetWidth;
  root.removeAttribute('data-instant');
}

// ─── For the UI ───────────────────────────────────────────────

const bridge = () => useUI.getState().desktopBridge;

/** Hides the diary (it stays in the tray, ready for the shortcut). */
export const hideDesktop = () => bridge()?.hide() ?? Promise.resolve();

/** Saves today's backup even if nothing changed. */
export async function backupDesktop() {
  await bridge()?.backup(true);
  const { desktop, showToast } = useUI.getState();
  if (desktop?.lastBackup) showToast(t().desktop.backupSaved);
}

/** Quits diaryo after saving and backing up everything. */
export const quitDesktop = () => bridge()?.quit() ?? call('quit_app');

/** Switches to the window or to the floating diary. */
export const showDesktopMode = (mode: DesktopMode) => call('show_mode', { mode });

/** Pins the current view of the floating diary. */
export const pinDeskView = () => bridge()?.pinView();
