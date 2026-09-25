import { bookBoundsWith } from '../engine/book';
import { isEditableTarget } from '../engine/dom';
import type { Engine, ScreenRect } from '../engine/engine';
import { Autosave, type SaveStatus } from '../storage/autosave';
import { DESK_ID, DESK_INFO, getDB, listPages, loadPage } from '../storage/db';
import { loadThemePreference, THEME_KEY, useUI } from '../store/ui';
import { DESK_VIEW_KEY, readDeskView } from './saved';
import { deskKeyAction } from './shortcuts';
import { call, isDesktop, listen, notifyDeskSaved, onDeskChangedElsewhere } from './tauri';
/**
 * La mesa en el escritorio de Windows: lo que hay en la mesa, en el mismo sitio que
 * alrededor del diario flotante, en una ventana transparente detrás de las demás. Solo
 * recibe el ratón donde hay algo (manda esas zonas a la parte de escritorio); el resto de
 * clics llegan al escritorio. Se mueve, se escribe y se marcan tareas; para crear cosas
 * nuevas está el diario. Fuera de la app de escritorio (en el navegador, para probarla)
 * solo se pinta.
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
    /** Lo que hay encima del lienzo y también recibe el ratón (el mini diario). */
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

    await this.frameBook();
    await this.autosave.start();
    if (!this.desktop || this.stopped) return;
    const unlisten = await Promise.all([
      onDeskChangedElsewhere(() => void this.reload()),
      // Cada vez que se enseña: el libro puede tener pestañas nuevas.
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

  /** Dónde hay algo: ahí la ventana recibe el ratón (se manda una vez por frame, si cambia). */
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
   * La mesa en el mismo sitio que alrededor del diario flotante: con su vista fijada o,
   * si no hay, como encuadra el libro al abrirse (con pestañas, deja sitio para ellas).
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

  /** Lo cambiado en el diario (o al abrir una copia) se vuelve a leer. */
  private async reload() {
    await this.autosave.flush();
    const desk = await loadPage(this.db, DESK_ID);
    if (this.stopped) return;
    for (const asset of desk.assets) this.engine.assets.add(asset.src, asset.id, false);
    this.engine.loadPage(desk.elements);
    await this.frameBook();
  }

  /** Lo guardado aquí se avisa a las otras ventanas. */
  private readonly onStatus = (status: SaveStatus) => {
    if (this.desktop && status === 'saved' && this.saveStatus === 'saving') {
      void notifyDeskSaved();
    }
    this.saveStatus = status;
  };

  private listenWindow() {
    const { engine } = this;
    // Al pasar a otra cosa (un clic en el escritorio, otra ventana), se suelta lo que había.
    const onBlur = () => {
      engine.finishEditing();
      engine.clearSelection();
    };
    // La cámara está fija: ni rueda ni arrastrar con la rueda.
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
    // Lo que cambia en la otra ventana: el tema y la vista fijada.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) useUI.getState().setThemePreference(loadThemePreference());
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
