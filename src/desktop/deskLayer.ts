import { bookBoundsWith } from '../engine/book';
import { isEditableTarget } from '../engine/dom';
import type { Engine, ScreenRect } from '../engine/engine';
import { handlePrivacy } from '../cloud/lockState';
import { Autosave, type SaveStatus } from '../storage/autosave';
import { DESK_ID, DESK_INFO, getDB, listPages, loadPage } from '../storage/db';
import { loadThemePreference, SETTINGS_KEY, THEME_KEY, useUI } from '../store/ui';
import { DESK_VIEW_KEY, readDeskView } from './saved';
import { deskKeyAction } from './shortcuts';
import { call, isDesktop, listen, notifyDeskSaved, onDeskChangedElsewhere } from './tauri';
/**
 * The desk on the Windows desktop: what is on the desk, in the same place as around the
 * floating diary, in a transparent window behind the others. It only takes the mouse
 * where there is something (it sends those areas to the desktop side); the rest of the
 * clicks reach the desktop. Things can be moved, written and tasks ticked; creating new
 * things is done in the diary. Outside the desktop app (in the browser, to try it) it
 * only draws.
 */
export class DeskLayerController {
  private readonly db = getDB();
  private readonly desktop = isDesktop();
  private readonly autosave: Autosave;
  private saveStatus: SaveStatus = 'loading';
  private frame = 0;
  private sentAreas = '';
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly engine: Engine,
    /** What is on top of the canvas and also takes the mouse (the mini diary). */
    private readonly extraArea: () => DOMRect | null,
  ) {
    this.autosave = new Autosave(this.db, engine, () => DESK_INFO, this.onStatus, false);
  }

  async start() {
    const { engine } = this;
    engine.setTool('select');
    this.cleanups.push(
      engine.subscribeState(this.sendAreas),
      engine.subscribe(this.sendAreas),
      engine.subscribeEditing((editing) => {
        useUI.getState().setEditing(editing);
        this.sendAreas();
      }),
    );
    this.listenWindow();
    // The private notes shown or hidden (from the diary's window): the desk loads again.
    handlePrivacy(async (apply) => {
      this.engine.finishEditing(false);
      await this.autosave.flush();
      apply();
      await this.reload();
    });
    this.cleanups.push(() => handlePrivacy(null));

    await this.frameBook();
    await this.autosave.start();
    if (!this.desktop || this.stopped) return;
    const unlisten = await Promise.all([
      onDeskChangedElsewhere(() => void this.reload()),
      // Every time it is shown: the book may have new tabs.
      listen('diaryo://desk-shown', () => void this.frameBook()),
    ]);
    this.cleanups.push(...unlisten);
    if (this.stopped) this.stop();
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    void this.autosave.stop();
  }

  /**
   * Where there is something: there the window takes the mouse (sent once per frame, if
   * it changed).
   */
  readonly sendAreas = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const areas: ScreenRect[] = this.engine.hitAreas();
      const extra = this.extraArea();
      if (extra) areas.push({ x: extra.x, y: extra.y, width: extra.width, height: extra.height });
      const key = JSON.stringify(areas);
      if (key === this.sentAreas) return;
      this.sentAreas = key;
      if (this.desktop) void call('set_desk_areas', { areas });
    });
  };

  /**
   * The desk in the same place as around the floating diary: with its pinned view or, if
   * there is none, framed like the book when it opens (with tabs, it leaves room for
   * them).
   */
  private async frameBook() {
    const view = readDeskView();
    if (view) {
      this.engine.lockView(view);
      return;
    }
    const pages = await listPages(this.db);
    if (!this.stopped) this.engine.lockCamera(bookBoundsWith(pages.some((p) => p.bookmark)));
  }

  /** Whatever changed in the diary (or when opening a backup) is read again. */
  private async reload() {
    await this.autosave.flush();
    const desk = await loadPage(this.db, DESK_ID);
    if (this.stopped) return;
    for (const asset of desk.assets) this.engine.assets.add(asset.src, asset.id, false);
    this.engine.loadPage(desk.elements);
    await this.frameBook();
  }

  /** What is saved here is announced to the other windows. */
  private readonly onStatus = (status: SaveStatus) => {
    if (this.desktop && status === 'saved' && this.saveStatus === 'saving') {
      void notifyDeskSaved();
    }
    this.saveStatus = status;
  };

  private listenWindow() {
    const { engine } = this;
    // When switching to something else (a click on the desktop, another window), whatever
    // was held is released.
    const onBlur = () => {
      engine.finishEditing();
      engine.clearSelection();
    };
    // The camera is fixed: no wheel and no dragging with the wheel.
    const stopWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const stopMiddle = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      e.stopPropagation();
      const action = deskKeyAction(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'undo') engine.undo();
      else if (action === 'redo') engine.redo();
      else if (action === 'delete') engine.deleteSelection();
      else if (action === 'edit') engine.editSelection();
      else if (action === 'deselect') engine.clearSelection();
    };
    // What changes in the other window: the theme, the settings (the language) and the
    // pinned view.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) useUI.getState().setThemePreference(loadThemePreference());
      if (e.key === SETTINGS_KEY) useUI.getState().reloadSettings();
      if (e.key === DESK_VIEW_KEY) void this.frameBook();
    };
    const preventMenu = (e: Event) => e.preventDefault();
    const listeners: [string, EventListener, AddEventListenerOptions | boolean][] = [
      ['blur', onBlur as EventListener, false],
      ['wheel', stopWheel as EventListener, { capture: true, passive: false }],
      ['pointerdown', stopMiddle as EventListener, true],
      ['keydown', onKeyDown as EventListener, true],
      ['storage', onStorage as EventListener, false],
      ['contextmenu', preventMenu, false],
    ];
    for (const [type, listener, options] of listeners) {
      window.addEventListener(type, listener, options);
      this.cleanups.push(() => window.removeEventListener(type, listener, options));
    }
  }
}
