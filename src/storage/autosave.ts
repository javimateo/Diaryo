import type { Camera } from '../engine/camera';
import { isOnPage } from '../engine/book';
import { elementBounds } from '../engine/elements';
import type { Engine } from '../engine/engine';
import { fonts } from '../engine/fonts';
import {
  loadPage,
  saveChanges,
  type AssetRow,
  type DiaryoDB,
  type FontRow,
  type PageInfo,
  DESK_INFO,
} from './db';

/** Lo que hay en la mesa (común a todas las páginas): lo comparten los autoguardados. */
export interface Desk {
  ids: Set<string>;
  /**
   * Si cada elemento estaba dentro del libro la última vez que se guardó. Un elemento solo
   * pasa de la mesa a la página (o al revés) cuando cruza el borde del libro: lo que se
   * deja en la mesa donde luego se abre el libro (desde el escritorio, por ejemplo) sigue
   * siendo de la mesa.
   */
  onPage: Map<string, boolean>;
  /** Se ha guardado algo de la mesa (para avisar a la capa del escritorio). */
  onSaved?: () => void;
}

/**
 * ¿Es de la mesa? Lo nuevo o lo que cruza el borde del libro es de donde ha quedado (fuera
 * del libro, de la mesa); lo demás sigue siendo de donde era. Apunta dónde queda.
 */
export function belongsToDesk(desk: Desk, id: string, onPage: boolean): boolean {
  const before = desk.onPage.get(id);
  desk.onPage.set(id, onPage);
  return before === undefined || before !== onPage ? !onPage : desk.ids.has(id);
}

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

/** Espera tras el último cambio antes de escribir (agrupa ráfagas de cambios). */
const DELAY = 400;

/**
 * Autoguardado: carga la página al empezar y, a partir de ahí, escribe en la base de
 * datos solo lo que cambia (elementos, imágenes nuevas, fuentes subidas y la cámara).
 */
export class Autosave {
  private readonly dirty = new Set<string>();
  private readonly assets: AssetRow[] = [];
  private readonly savedFonts = new Set<string>();
  private camera: Camera | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly db: DiaryoDB,
    private readonly engine: Engine,
    /** La página se lee al guardar: su título puede cambiar mientras está abierta. */
    private readonly page: () => PageInfo,
    private readonly onStatus: (status: SaveStatus) => void,
    /** Volver a donde se estaba mirando (en el diario, cada página se abre entera). */
    private readonly restoreCamera = true,
    /** En el diario: lo que queda fuera del libro se guarda en la mesa. */
    private readonly desk: Desk | null = null,
  ) {}

  /** Carga la página en el motor y empieza a guardar sus cambios. */
  async start(): Promise<boolean> {
    try {
      const page = await loadPage(this.db, this.page().id);
      if (this.stopped) return false;
      // Primero las fuentes y las imágenes: el texto se mide con su fuente real.
      for (const font of page.fonts) {
        await fonts.addCustom(font.name, font.src, font.id).catch(() => undefined);
        this.savedFonts.add(font.id);
      }
      if (this.stopped) return false;
      for (const asset of page.assets) this.engine.assets.add(asset.src, asset.id, false);
      this.engine.loadPage(page.elements, this.restoreCamera ? page.camera : null);
      this.listen();
      // Lo que se dibujó fuera del libro antes de existir la mesa pasa a ella.
      if (this.desk) {
        const outside = page.elements.filter((el) => !isOnPage(elementBounds(el)));
        for (const el of page.elements) {
          if (!outside.includes(el)) this.desk.onPage.set(el.id, true);
        }
        if (outside.length > 0) {
          outside.forEach((el) => this.dirty.add(el.id));
          this.schedule();
        }
      }
      this.onStatus('saved');
      // Que el navegador no borre los datos si le falta espacio.
      void navigator.storage?.persist?.();
      return true;
    } catch (error) {
      console.error('No se ha podido cargar la página', error);
      this.onStatus('error');
      return false;
    }
  }

  /** Guarda lo pendiente ya (al cerrar o esconder la ventana). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    const upserts = [];
    const deletes = [];
    const deskUpserts = [];
    const deskDeletes = [];
    const desk = this.desk;
    for (const id of this.dirty) {
      const el = this.engine.scene.get(id);
      // Si pasa de la mesa a la página (o al revés), sale de la otra.
      const toDesk = !!el && !!desk && belongsToDesk(desk, id, isOnPage(elementBounds(el)));
      if (!el) desk?.onPage.delete(id);
      if (el && toDesk && desk) {
        deskUpserts.push(el);
        if (!desk.ids.has(id)) deletes.push(id);
        desk.ids.add(id);
      } else if (el) {
        upserts.push(el);
        if (desk?.ids.delete(id)) deskDeletes.push(id);
      } else {
        if (desk?.ids.delete(id)) deskDeletes.push(id);
        else deletes.push(id);
      }
    }
    const deskSave =
      deskUpserts.length || deskDeletes.length
        ? { upserts: deskUpserts, deletes: deskDeletes, assets: [], fonts: [] }
        : null;
    const fontsToSave: FontRow[] = fonts
      .customFonts()
      .filter((font) => !this.savedFonts.has(font.id));
    const save = {
      upserts,
      deletes,
      assets: this.assets.splice(0),
      fonts: fontsToSave,
      camera: this.camera,
    };
    this.dirty.clear();
    this.camera = undefined;
    const pageEmpty =
      !upserts.length &&
      !deletes.length &&
      !save.assets.length &&
      !fontsToSave.length &&
      !save.camera;
    if (pageEmpty && !deskSave) return this.saving;

    fontsToSave.forEach((font) => this.savedFonts.add(font.id));
    this.onStatus('saving');
    // Las escrituras van en fila para que nunca se adelante una más antigua.
    this.saving = this.saving
      .then(async () => {
        if (!pageEmpty) await saveChanges(this.db, this.page(), save);
        if (deskSave) {
          await saveChanges(this.db, DESK_INFO, deskSave);
          desk?.onSaved?.();
        }
      })
      .then(() => {
        if (!this.timer) this.onStatus('saved');
      })
      .catch((error) => {
        console.error('No se ha podido guardar', error);
        this.onStatus('error');
      });
    return this.saving;
  }

  /** Deja de escuchar y guarda lo pendiente (la promesa acaba cuando está escrito). */
  stop(): Promise<void> {
    this.stopped = true;
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;
    return this.flush();
  }

  private listen() {
    const { scene, assets } = this.engine;
    scene.onChange = (ids) => {
      ids.forEach((id) => this.dirty.add(id));
      this.schedule();
    };
    assets.onAdd = (id, src) => {
      this.assets.push({ id, src });
      this.schedule();
    };
    this.cleanups.push(() => {
      scene.onChange = () => {};
      assets.onAdd = () => {};
    });
    // La cámara cambia a cada frame al moverse: se guarda con calma.
    this.cleanups.push(
      this.engine.subscribe((camera) => {
        this.camera = camera;
        this.schedule(1500);
      }),
    );
    this.cleanups.push(fonts.subscribe(() => this.schedule()));
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    const onUnload = () => void this.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    });
  }

  private schedule(delay = DELAY) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }
}
