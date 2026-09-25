import { isOnPage, type BookSpread, type BookStyle, type PaperStyle } from '../engine/book';
import { textOf } from '../engine/containers';
import { isEditable } from '../engine/editing';
import { elementBounds, type SceneElement } from '../engine/elements';
import type { Engine } from '../engine/engine';
import type { TurnDirection, TurnTarget } from '../engine/pageTurn';
import { Autosave, type Desk, type SaveStatus } from '../storage/autosave';
import {
  deletePage,
  DESK_ID,
  dumpDiary,
  listLinks,
  listTexts,
  listPages,
  loadPage,
  mergeDiary,
  pruneEmptyPages,
  restorePage,
  updatePage,
  type DiaryDump,
  type DiaryoDB,
  type PageInfo,
  type PageLink,
  type TextEntry,
  type PageRow,
  type StoredPage,
} from '../storage/db';
import { formatDay, formatDayMonth, todayKey, type DayKey } from './dates';
import { comparePages, neighbor, newPage, pagesOfDay, sortPages, type PageMeta } from './pages';

export interface DiaryState {
  /** Páginas con algo escrito (o con título), en orden; incluye la abierta si ya lo tiene. */
  pages: PageMeta[];
  current: PageMeta | null;
}

/** Cómo pasa la hoja al cambiar de página (no al arrastrar la esquina, que va a mano). */
export type TurnSpeed = 'normal' | 'fast' | 'off';

export interface DiaryHooks {
  onState: (state: DiaryState) => void;
  onStatus: (status: SaveStatus) => void;
  /** Aspecto del diario (hoja, encuadernación, tapas). */
  bookStyle: () => BookStyle;
  turnSpeed?: () => TurnSpeed;
  /** Se ha guardado algo de la mesa (o ha cambiado entera al abrir una copia). */
  onDeskSaved?: () => void;
}

/** La página de hoy para el mini diario del escritorio. */
export interface TodayPreview {
  day: DayKey;
  /** La doble página (papel y contenido), como imagen. */
  image: string;
  /** Tareas por hacer. */
  pending: number;
}

/** Duración (ms) de la hoja que pasa sola, según la velocidad. */
const TURN_DURATION = { normal: 720, fast: 380 };

const LAST_PAGE_KEY = 'diaryo:last-page';
/** Miniatura: la doble página a este ancho (el alto sale de su proporción). */
export const THUMBNAIL_SIZE = { width: 360, height: 246 };

const toMeta = (row: PageRow): PageMeta => ({
  id: row.id,
  date: row.date,
  order: row.order,
  title: row.title,
  thumbnail: row.thumbnail,
  thumbnailSpread: row.thumbnailSpread === true,
  bookmark: row.bookmark ?? null,
  paper: row.paper ?? null,
  updatedAt: row.updatedAt,
});

/** Colores de las pestañas: cada página nueva que se marca toma el siguiente. */
export const BOOKMARK_COLORS = ['#e9785f', '#3aa6a0', '#5b8fd6', '#d9a13b', '#a77bd6', '#5fa05a'];

const toInfo = ({ id, date, order, title }: PageMeta): PageInfo => ({ id, date, order, title });

/** Última página abierta y el día en que se abrió. */
function readLastPage(): { id: string; day: DayKey } | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) ?? 'null');
    return typeof value?.id === 'string' && typeof value?.day === 'string' ? value : null;
  } catch {
    return null;
  }
}

function writeLastPage(id: string) {
  try {
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ id, day: todayKey() }));
  } catch {
    // No es crítico.
  }
}

/**
 * El diario: qué páginas hay, cuál está abierta y cómo se pasa de una a otra. Cada
 * página es un lienzo; al cambiar de página se guarda la anterior y se carga la nueva.
 * Las páginas vacías y sin título no se guardan (el diario no se llena de hojas en blanco).
 */
export class Diary {
  private pages: PageMeta[] = [];
  private current: PageMeta | null = null;
  private autosave: Autosave | null = null;
  private isEmpty = true;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];
  /** Hoy aún sin página: siempre la misma mientras no se abra (para pasar a ella). */
  private blankToday: PageMeta | null = null;
  /** Lo que hay en la mesa (fuera del libro), común a todas las páginas. */
  private readonly desk: Desk = { ids: new Set(), onPage: new Map() };
  /** Elementos de otras páginas, cargados para dibujarlas al pasar página. */
  private readonly loaded = new Map<string, Promise<SceneElement[]>>();

  constructor(
    private readonly db: DiaryoDB,
    private readonly engine: Engine,
    private readonly hooks: DiaryHooks,
  ) {
    // Se ha soltado la hoja pasada la mitad: se abre esa página (ya se ve).
    engine.onPageTurn((dir) => void this.completeTurn(dir));
    // La pestaña de una página marcada lleva a ella.
    engine.onBookTab((id) => void this.goToPage(id));
    this.desk.onSaved = () => hooks.onDeskSaved?.();
    // Lo de la mesa no es de la página aunque esté donde se abre el libro.
    engine.setDeskIds(this.desk.ids);
  }

  /** Abre el diario: la última página si fue hoy; si no, la página de hoy. */
  start() {
    return this.run(async () => {
      this.hooks.onStatus('loading');
      try {
        await pruneEmptyPages(this.db);
        this.pages = (await listPages(this.db)).map(toMeta);
        // La mesa se pone una vez y se queda al pasar página.
        await this.loadDesk();
      } catch (error) {
        console.error('No se ha podido abrir el diario', error);
        this.hooks.onStatus('error');
        return;
      }
      if (this.stopped) return;
      const today = todayKey();
      const last = readLastPage();
      const lastPage = last?.day === today ? this.pages.find((p) => p.id === last.id) : undefined;
      await this.open(lastPage ?? this.lastOfDay(today) ?? newPage(today), 0);
      if (this.stopped) return;

      this.cleanups.push(
        this.engine.subscribeState(({ isEmpty }) => {
          if (isEmpty === this.isEmpty) return;
          this.isEmpty = isEmpty;
          this.emit();
        }),
      );
      const onHide = () => {
        if (document.visibilityState === 'hidden') void this.saveThumbnail();
      };
      document.addEventListener('visibilitychange', onHide);
      this.cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
    });
  }

  stop() {
    this.stopped = true;
    this.cleanups.forEach((fn) => fn());
    void this.autosave?.stop();
    this.autosave = null;
  }

  /** Guarda ya lo pendiente de la página abierta. */
  flush(): Promise<void> {
    return this.autosave?.flush() ?? Promise.resolve();
  }

  // ─── Navegación ───────────────────────────────────────────────

  /** Pasa a la página siguiente (1) o anterior (-1). Devuelve false si no hay más. */
  turn(direction: 1 | -1): Promise<boolean> {
    return this.run(async () => {
      const current = this.current;
      if (!current) return false;
      const target = this.neighborsOf(current)[direction === 1 ? 'next' : 'prev'];
      if (!target) return false;
      await this.open(target, direction);
      return true;
    });
  }

  /** Va a un día: su primera página, o una en blanco si aún no tiene. */
  goToDay(date: DayKey) {
    return this.run(async () => {
      if (!this.current || this.current.date === date) return;
      await this.openAnimated(pagesOfDay(this.pages, date)[0] ?? newPage(date));
    });
  }

  /** Va a hoy (a la última página de hoy). */
  goToToday() {
    return this.run(async () => {
      const today = todayKey();
      if (!this.current || this.current.date === today) return;
      await this.openAnimated(this.lastOfDay(today) ?? newPage(today));
    });
  }

  /** Abre una página (pasando las hojas, o de golpe con `animate` a false). */
  goToPage(id: string, animate = true) {
    return this.run(async () => {
      const target = this.pages.find((p) => p.id === id);
      if (!target || target.id === this.current?.id) return;
      if (animate) await this.openAnimated(target);
      else await this.open(target, 0);
    });
  }

  /** Hoja nueva para hoy (detrás de las que ya hay). */
  addPage() {
    return this.run(async () => {
      const current = this.current;
      const today = todayKey();
      // Ya hay una hoja en blanco abierta: no hace falta otra.
      if (current && current.date === today && this.isEmpty && !current.title) return;
      await this.openAnimated(newPage(today));
    });
  }

  // ─── Editar páginas ───────────────────────────────────────────

  rename(id: string, title: string) {
    return this.run(async () => {
      const page = id === this.current?.id ? this.current : this.pages.find((p) => p.id === id);
      if (!page) return;
      const updated = { ...page, title: title.trim() };
      await updatePage(this.db, toInfo(updated), { title: updated.title });
      if (id === this.current?.id) this.current = updated;
      this.upsert(updated);
    });
  }

  /**
   * Marca o desmarca una página como importante (le pone o quita su pestaña). Sin
   * color, cada página nueva que se marca toma el siguiente color libre.
   */
  setBookmark(id: string, color: string | null) {
    return this.run(async () => {
      const page = id === this.current?.id ? this.current : this.pages.find((p) => p.id === id);
      if (!page) return;
      const updated = { ...page, bookmark: color };
      await updatePage(this.db, toInfo(updated), { bookmark: color });
      if (id === this.current?.id) this.current = updated;
      this.upsert(updated);
    });
  }

  /** Pone a una página su propia hoja (null: vuelve a la de todo el diario). */
  setPaper(id: string, paper: PaperStyle | null) {
    return this.run(async () => {
      const page = id === this.current?.id ? this.current : this.pages.find((p) => p.id === id);
      if (!page) return;
      const updated = { ...page, paper };
      await updatePage(this.db, toInfo(updated), { paper });
      if (id === this.current?.id) this.current = updated;
      this.upsert(updated);
    });
  }

  /** Siguiente color de pestaña: el menos usado (y en orden, si empatan). */
  nextBookmarkColor(): string {
    const all = [...this.pages, ...(this.current ? [this.current] : [])];
    const uses = (color: string) => all.filter((p) => p.bookmark === color).length;
    return BOOKMARK_COLORS.reduce((best, color) => (uses(color) < uses(best) ? color : best));
  }

  /** Borra una página. Devuelve lo borrado para poder recuperarlo. */
  remove(id: string): Promise<StoredPage | null> {
    return this.run(async () => {
      const current = this.current;
      if (current?.id !== id) {
        const stored = await deletePage(this.db, id);
        this.pages = this.pages.filter((p) => p.id !== id);
        this.emit();
        return stored;
      }
      // Se deja de guardar la página antes de borrarla, y se abre la de al lado.
      await this.autosave?.stop();
      this.autosave = null;
      const others = this.pages.filter((p) => p.id !== id);
      const target =
        neighbor(others, current, -1) ?? neighbor(others, current, 1) ?? newPage(todayKey());
      const stored = await deletePage(this.db, id);
      this.pages = others;
      await this.open(target, 0);
      return stored;
    });
  }

  restore(stored: StoredPage) {
    return this.run(async () => {
      await restorePage(this.db, stored);
      this.pages = [...this.pages.filter((p) => p.id !== stored.page.id), toMeta(stored.page)];
      this.emit();
    });
  }

  /** Vuelve a dibujar el libro (p. ej. al cambiar su aspecto). */
  refreshBook() {
    const current = this.current;
    if (!current) return;
    this.engine.setBook(this.spreadFor(current));
    void this.refreshNeighbors();
  }

  /** Todo lo escrito en el diario (con lo último ya guardado), para buscar. */
  texts(): Promise<TextEntry[]> {
    return this.run(async () => {
      await this.flush();
      return listTexts(this.db);
    });
  }

  /** Qué páginas enlazan con cuáles (con lo último ya guardado). */
  links(): Promise<PageLink[]> {
    return this.run(async () => {
      await this.flush();
      return listLinks(this.db);
    });
  }

  /**
   * Rehace en segundo plano las miniaturas antiguas (solo el contenido) como doble
   * página, que es como se ven en el mapa y al volar al libro.
   */
  async refreshOldThumbnails() {
    const old = this.pages.filter((p) => !p.thumbnailSpread && p.id !== this.current?.id);
    for (const page of old) {
      if (this.stopped) return;
      const target = await this.targetFor(page);
      if (target.elements.length === 0) continue;
      // Con sus fotos ya cargadas.
      await this.engine.assets.whenReady(
        target.elements.flatMap((el) => (el.type === 'image' ? [el.assetId] : [])),
      );
      const thumbnail = this.engine.spreadThumbnail(target, THUMBNAIL_SIZE.width);
      await updatePage(this.db, toInfo(page), { thumbnail, thumbnailSpread: true });
      const latest = this.pages.find((p) => p.id === page.id);
      if (latest) this.upsert({ ...latest, thumbnail, thumbnailSpread: true });
    }
  }

  /**
   * La doble página de hoy como imagen (para el mini diario del escritorio), con cuántas
   * tareas quedan por hacer. Si hoy aún no hay página, la de hoy en blanco.
   */
  todayPreview(width: number): Promise<TodayPreview> {
    return this.run(async () => {
      const today = todayKey();
      const current = this.current;
      const page = current?.date === today ? current : (this.lastOfDay(today) ?? newPage(today));
      const elements =
        page.id === current?.id
          ? this.engine.pageElements()
          : (await this.targetFor(page)).elements;
      await this.engine.assets.whenReady(
        elements.flatMap((el) => (el.type === 'image' ? [el.assetId] : [])),
      );
      const target = { id: page.id, elements, book: this.spreadFor(page) };
      const pending = elements
        .filter(isEditable)
        .reduce((n, el) => n + (textOf(el).match(/^\s*\[ \]/gm)?.length ?? 0), 0);
      return { day: today, image: this.engine.spreadThumbnail(target, width), pending };
    });
  }

  /** Actualiza la miniatura de la página abierta (para verla al día en el índice). */
  refreshThumbnail() {
    const current = this.current;
    if (!current || this.isEmpty) return;
    this.upsert({ ...current, thumbnail: this.renderThumbnail(), thumbnailSpread: true });
  }

  // ─── Copias ───────────────────────────────────────────────────

  /** Todo el diario tal como está guardado (con lo último ya escrito). */
  dump(): Promise<DiaryDump> {
    return this.run(async () => {
      await this.flush();
      await this.saveThumbnail();
      return dumpDiary(this.db);
    });
  }

  /** Recupera una copia del diario. Devuelve cuántas páginas han entrado y si cambió la mesa. */
  merge(dump: DiaryDump): Promise<{ pages: number; desk: boolean }> {
    return this.run(async () => {
      await this.flush();
      const merged = await mergeDiary(this.db, dump);
      const desk = merged.includes(DESK_ID);
      if (desk) {
        await this.loadDesk();
        this.hooks.onDeskSaved?.();
      }
      this.loaded.clear();
      this.pages = (await listPages(this.db)).map(toMeta);
      const current = this.current;
      if (current && merged.includes(current.id)) {
        // La página abierta ha cambiado: se vuelve a cargar sin guardar encima.
        await this.autosave?.stop();
        this.autosave = null;
        await this.open(this.pages.find((p) => p.id === current.id) ?? current, 0);
      } else this.emit();
      return { pages: merged.length - (desk ? 1 : 0), desk };
    });
  }

  /**
   * Vuelve a poner la mesa con lo guardado (sin contarlo como un cambio que guardar): la
   * capa del escritorio la ha cambiado.
   */
  reloadDesk(): Promise<void> {
    return this.run(() => this.loadDesk());
  }

  private async loadDesk() {
    const desk = await loadPage(this.db, DESK_ID);
    for (const asset of desk.assets) this.engine.assets.add(asset.src, asset.id, false);
    const ids = new Set(desk.elements.map((el) => el.id));
    const removed = [...this.desk.ids].filter((id) => !ids.has(id));
    this.desk.ids.clear();
    ids.forEach((id) => this.desk.ids.add(id));
    removed.forEach((id) => this.desk.onPage.delete(id));
    for (const el of desk.elements) this.desk.onPage.set(el.id, isOnPage(elementBounds(el)));
    this.engine.loadDesk(desk.elements, removed);
  }

  // ─── Interno ──────────────────────────────────────────────────

  /** Las tareas van en fila: nunca se cargan dos páginas a la vez. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch((error) => console.error(error));
    return result;
  }

  private openAnimated(target: PageMeta) {
    const current = this.current;
    const direction = current && comparePages(target, current) < 0 ? -1 : 1;
    return this.open(target, direction);
  }

  private async open(target: PageMeta, direction: 0 | 1 | -1) {
    // Lo que se estuviera escribiendo se queda en la página que se deja.
    this.engine.finishEditing(false);
    const speed = this.hooks.turnSpeed?.() ?? 'normal';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (direction !== 0 && speed !== 'off' && !reduced) {
      // La hoja pasa sola, viendo la doble página entera, y se queda caída mientras
      // se carga la nueva.
      const turnTarget = await this.targetFor(target);
      this.engine.showWholeBook();
      await this.engine.animatePageTurn(direction, turnTarget, TURN_DURATION[speed]);
    }
    await this.leave();
    if (this.stopped) return;
    if (target.id === this.blankToday?.id) this.blankToday = null;
    this.current = target;
    this.refreshBook();
    writeLastPage(target.id);
    const autosave = new Autosave(
      this.db,
      this.engine,
      () => toInfo(this.current ?? target),
      this.hooks.onStatus,
      false,
      this.desk,
    );
    this.autosave = autosave;
    await autosave.start();
    if (this.stopped) return;
    this.isEmpty = this.engine.pageElements().length === 0;
    this.emit();
    this.engine.endPageTurn();
  }

  /** Termina de pasar la página que se soltó arrastrando la esquina. */
  private completeTurn(dir: TurnDirection) {
    return this.run(async () => {
      const current = this.current;
      const target = current && this.neighborsOf(current)[dir === 1 ? 'next' : 'prev'];
      if (target) await this.open(target, 0);
      else this.engine.endPageTurn();
    });
  }

  /** Página anterior y siguiente. Hoy siempre está en el camino, aunque no tenga página. */
  private neighborsOf(current: PageMeta) {
    const today = todayKey();
    const candidates = [...this.pages];
    if (current.date !== today && !candidates.some((p) => p.date === today)) {
      this.blankToday ??= newPage(today);
      candidates.push(this.blankToday);
    }
    return {
      prev: neighbor(candidates, current, -1),
      next: neighbor(candidates, current, 1),
    };
  }

  /** Cómo se ve la doble página de un día: fecha, número de página y grosor. */
  private spreadFor(page: PageMeta): BookSpread {
    const others = this.pages.filter((p) => p.id !== page.id && p.id !== this.current?.id);
    const all = sortPages(
      this.current && this.current.id !== page.id
        ? [...others, this.current, page]
        : [...others, page],
    );
    const index = all.findIndex((p) => p.id === page.id);
    // Pestañas: las de antes de esta página asoman por la izquierda; el resto, por la derecha.
    const tabs = all
      .filter((p) => p.bookmark)
      .map((p) => ({
        pageId: p.id,
        label: p.title || formatDayMonth(p.date),
        color: p.bookmark!,
        side: comparePages(p, page) < 0 ? ('left' as const) : ('right' as const),
        current: p.id === page.id,
      }));
    const style = this.hooks.bookStyle();
    return {
      tabs,
      style: page.paper ? { ...style, paper: page.paper } : style,
      date: formatDay(page.date),
      title: page.title,
      today: page.date === todayKey(),
      pageNumber: index * 2 + 1,
    };
  }

  /** Lo necesario para dibujar otra página mientras se pasa a ella. */
  private async targetFor(page: PageMeta): Promise<TurnTarget> {
    let elements = this.loaded.get(page.id);
    if (!elements) {
      const saved = this.pages.some((p) => p.id === page.id);
      elements = saved
        ? loadPage(this.db, page.id).then((data) => {
            // Sus imágenes, sin volver a guardarlas.
            for (const asset of data.assets) this.engine.assets.add(asset.src, asset.id, false);
            return data.elements;
          })
        : Promise.resolve([]);
      this.loaded.set(page.id, elements);
    }
    return { id: page.id, elements: await elements.catch(() => []), book: this.spreadFor(page) };
  }

  /** Prepara las páginas de al lado para poder pasar a ellas arrastrando la esquina. */
  private async refreshNeighbors() {
    const current = this.current;
    if (!current) return;
    const { prev, next } = this.neighborsOf(current);
    const [before, after] = await Promise.all([
      prev ? this.targetFor(prev) : null,
      next ? this.targetFor(next) : null,
    ]);
    if (this.current === current) this.engine.setTurnTargets(before, after);
  }

  /** Cierra la página abierta: la guarda con su miniatura o la descarta si está vacía. */
  private async leave() {
    const autosave = this.autosave;
    const page = this.current;
    if (!autosave || !page) return;
    this.autosave = null;
    await autosave.stop();
    // Lo cargado de esta página ya no vale: ha podido cambiar mientras estaba abierta.
    this.loaded.delete(page.id);
    if (this.engine.pageElements().length === 0 && !page.title && !page.bookmark && !page.paper) {
      await deletePage(this.db, page.id);
      this.pages = this.pages.filter((p) => p.id !== page.id);
      return;
    }
    const thumbnail = this.renderThumbnail();
    await updatePage(this.db, toInfo(page), { thumbnail, thumbnailSpread: true });
    this.upsert({ ...page, thumbnail, thumbnailSpread: true, updatedAt: Date.now() }, false);
  }

  private async saveThumbnail() {
    const page = this.current;
    if (!page || this.engine.pageElements().length === 0) return;
    const thumbnail = this.renderThumbnail();
    await updatePage(this.db, toInfo(page), { thumbnail, thumbnailSpread: true });
    this.upsert({ ...page, thumbnail, thumbnailSpread: true }, false);
  }

  private renderThumbnail() {
    return this.engine.thumbnail(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
  }

  private upsert(page: PageMeta, emit = true) {
    this.pages = [...this.pages.filter((p) => p.id !== page.id), page];
    if (emit) this.emit();
  }

  private lastOfDay(date: DayKey): PageMeta | undefined {
    return pagesOfDay(this.pages, date).at(-1);
  }

  private emit() {
    const current = this.current;
    let pages = this.pages;
    // La página abierta aparece en el índice en cuanto tiene algo (o título).
    if (current) {
      const listed = pages.some((p) => p.id === current.id);
      const keep = !this.isEmpty || !!current.title || !!current.bookmark || !!current.paper;
      if (!listed && keep) pages = [...pages, current];
      if (listed && !keep) pages = pages.filter((p) => p.id !== current.id);
    }
    this.hooks.onState({ pages: [...pages].sort(comparePages), current });
    this.refreshBook();
  }
}
