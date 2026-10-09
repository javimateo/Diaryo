import type { Camera } from '../engine/camera';
import { isOnPage } from '../engine/book';
import { elementBounds, type SceneElement } from '../engine/elements';
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

/** What is on the desk (shared by all pages): the autosaves share it. */
export interface Desk {
  ids: Set<string>;
  /**
   * Whether each element was inside the book the last time it was saved. An element only
   * moves from the desk to the page (or the other way round) when it crosses the edge of
   * the book: whatever is left on the desk where the book later opens (from the desktop,
   * for example) still belongs to the desk.
   */
  onPage: Map<string, boolean>;
  /** Something on the desk was saved (to let the desktop layer know). */
  onSaved?: () => void;
}

/**
 * Does it belong to the desk? New elements, or those crossing the edge of the book,
 * belong to where they ended up (outside the book, the desk); the rest keep belonging
 * where they were. Records where it is.
 */
export function belongsToDesk(desk: Desk, id: string, onPage: boolean): boolean {
  const before = desk.onPage.get(id);
  desk.onPage.set(id, onPage);
  return before === undefined || before !== onPage ? !onPage : desk.ids.has(id);
}

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

/** Wait after the last change before writing (groups bursts of changes). */
const DELAY = 400;

/**
 * Autosave: loads the page at the start and, from then on, writes to the database only
 * what changes (elements, new images, uploaded fonts and the camera).
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
    /** The page is read when saving: its title may change while it is open. */
    private readonly page: () => PageInfo,
    private readonly onStatus: (status: SaveStatus) => void,
    /** Go back to where you were looking (in the diary, each page opens whole). */
    private readonly restoreCamera = true,
    /** In the diary: whatever ends up outside the book is saved on the desk. */
    private readonly desk: Desk | null = null,
    /**
     * What is loaded into the engine (the desk on the Windows desktop may leave the private
     * notes out). What isn't loaded is never touched: only changes are saved.
     */
    private readonly shows: (el: SceneElement) => boolean = () => true,
    /** The diary is closed: the page is its front cover (see isOnPage). */
    private readonly closed = false,
  ) {}

  /** Loads the page into the engine and starts saving its changes. */
  async start(): Promise<boolean> {
    try {
      const page = await loadPage(this.db, this.page().id);
      if (this.stopped) return false;
      // Fonts and images first: text is measured with its real font.
      for (const font of page.fonts) {
        await fonts.addCustom(font.name, font.src, font.id).catch(() => undefined);
        this.savedFonts.add(font.id);
      }
      if (this.stopped) return false;
      for (const asset of page.assets) this.engine.assets.add(asset.src, asset.id, false);
      const shown = page.elements.filter(this.shows);
      this.engine.loadPage(shown, this.restoreCamera ? page.camera : null);
      this.listen();
      // Whatever was drawn outside the book before the desk existed moves to it.
      if (this.desk) {
        const outside = page.elements.filter((el) => !isOnPage(elementBounds(el), this.closed));
        for (const el of page.elements) {
          if (!outside.includes(el)) this.desk.onPage.set(el.id, true);
        }
        if (outside.length > 0) {
          outside.forEach((el) => this.dirty.add(el.id));
          this.schedule();
        }
      }
      this.onStatus('saved');
      // Keep the browser from deleting the data when it runs out of space.
      void navigator.storage?.persist?.();
      return true;
    } catch (error) {
      console.error("Couldn't load the page", error);
      this.onStatus('error');
      return false;
    }
  }

  /** Saves what is pending right now (when closing or hiding the window). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    // No save is waiting any more: when this one ends, the status can say "Saved".
    this.timer = undefined;
    const upserts = [];
    const deletes = [];
    const deskUpserts = [];
    const deskDeletes = [];
    const desk = this.desk;
    for (const id of this.dirty) {
      const el = this.engine.scene.get(id);
      // If it moves from the desk to the page (or the other way round), it leaves the
      // other one.
      const toDesk =
        !!el && !!desk && belongsToDesk(desk, id, isOnPage(elementBounds(el), this.closed));
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
        ? {
            upserts: deskUpserts,
            deletes: deskDeletes,
            assets: [],
            fonts: [],
            restore: this.imagesOf(deskUpserts),
          }
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
      restore: this.imagesOf(upserts),
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
    // Writes are queued so an older one never overtakes a newer one.
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
        console.error("Couldn't save", error);
        this.onStatus('error');
      });
    return this.saving;
  }

  /** The files of the images among these elements (as the engine has them). */
  private imagesOf(elements: SceneElement[]): AssetRow[] {
    return elements.flatMap((el) => {
      const src = el.type === 'image' ? this.engine.assets.src(el.assetId) : undefined;
      return el.type === 'image' && src ? [{ id: el.assetId, src }] : [];
    });
  }

  /** Stops listening and saves what is pending (the promise ends when it is written). */
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
    // The camera changes every frame while moving: it is saved calmly.
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
