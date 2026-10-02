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
  replaceDiary,
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
import type { AppliedChanges } from '../storage/tracking';
import { todayKey, type DayKey } from '../lib/dates';
import { formatDay, formatDayMonth } from '../i18n/dates';
import { comparePages, neighbor, newPage, pagesOfDay, sortPages, type PageMeta } from './pages';
import { asRecord, readJSON, writeJSON } from '../lib/saved';
import { t } from '../i18n';

export interface DiaryState {
  /**
   * Pages with something written (or with a title), in order; includes the open one if it
   * already has something.
   */
  pages: PageMeta[];
  current: PageMeta | null;
}

/** How the sheet turns when changing page (not when dragging the corner, which is by hand). */
export type TurnSpeed = 'normal' | 'fast' | 'off';

export interface DiaryHooks {
  onState: (state: DiaryState) => void;
  onStatus: (status: SaveStatus) => void;
  /** Diary look (paper, binding, covers). */
  bookStyle: () => BookStyle;
  turnSpeed?: () => TurnSpeed;
  /** Something on the desk was saved (or it changed completely when opening a backup). */
  onDeskSaved?: () => void;
}

/** Today's page for the desktop mini diary. */
export interface TodayPreview {
  day: DayKey;
  /** The double page (paper and content), as an image. */
  image: string;
  /** Pending tasks. */
  pending: number;
}

/** Duration (ms) of a sheet turning by itself, depending on the speed. */
const TURN_DURATION = { normal: 720, fast: 380 };

const LAST_PAGE_KEY = 'diaryo:last-page';
/** Thumbnail: the double page at this width (the height follows its proportions). */
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

/** Tab colors: each newly marked page takes the next one. */
export const BOOKMARK_COLORS = ['#e9785f', '#3aa6a0', '#5b8fd6', '#d9a13b', '#a77bd6', '#5fa05a'];

const toInfo = ({ id, date, order, title }: PageMeta): PageInfo => ({ id, date, order, title });

/** Last opened page and the day it was opened. */
function readLastPage(): { id: string; day: DayKey } | null {
  const { id, day } = asRecord(readJSON(LAST_PAGE_KEY));
  return typeof id === 'string' && typeof day === 'string' ? { id, day } : null;
}

function writeLastPage(id: string) {
  writeJSON(LAST_PAGE_KEY, { id, day: todayKey() });
}

/**
 * The diary: which pages exist, which one is open and how to go from one to another. Each
 * page is a canvas; when changing page the previous one is saved and the new one loaded.
 * Empty untitled pages aren't saved (the diary doesn't fill up with blank sheets).
 */
export class Diary {
  private pages: PageMeta[] = [];
  private current: PageMeta | null = null;
  private autosave: Autosave | null = null;
  private isEmpty = true;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];
  /** Today without a page yet: always the same one while it isn't opened (to turn to it). */
  private blankToday: PageMeta | null = null;
  /** What is on the desk (outside the book), shared by all pages. */
  private readonly desk: Desk = { ids: new Set(), onPage: new Map() };
  /** Elements of other pages, loaded to draw them when turning the page. */
  private readonly loaded = new Map<string, Promise<SceneElement[]>>();

  constructor(
    private readonly db: DiaryoDB,
    private readonly engine: Engine,
    private readonly hooks: DiaryHooks,
  ) {
    // The sheet was released past the middle: that page opens (it is already visible).
    engine.onPageTurn((dir) => void this.completeTurn(dir));
    // The tab of a marked page leads to it.
    engine.onBookTab((id) => void this.goToPage(id));
    this.desk.onSaved = () => hooks.onDeskSaved?.();
    // Desk elements don't belong to the page even when they are where the book opens.
    engine.setDeskIds(this.desk.ids);
  }

  /** Opens the diary: the last page if it was today; otherwise, today's page. */
  start() {
    return this.run(async () => {
      this.hooks.onStatus('loading');
      try {
        await pruneEmptyPages(this.db);
        this.pages = (await listPages(this.db)).map(toMeta);
        // The desk is set once and stays when turning pages.
        await this.loadDesk();
      } catch (error) {
        console.error("Couldn't open the diary", error);
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

  /** Saves what is pending on the open page right now. */
  flush(): Promise<void> {
    return this.autosave?.flush() ?? Promise.resolve();
  }

  // ─── Navigation ───────────────────────────────────────────────

  /** Turns to the next (1) or previous (-1) page. Returns false if there are no more. */
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

  /** Goes to a day: its first page, or a blank one if it has none yet. */
  goToDay(date: DayKey) {
    return this.run(async () => {
      if (!this.current || this.current.date === date) return;
      await this.openAnimated(pagesOfDay(this.pages, date)[0] ?? newPage(date));
    });
  }

  /** Goes to today (to today's last page). */
  goToToday() {
    return this.run(async () => {
      const today = todayKey();
      if (!this.current || this.current.date === today) return;
      await this.openAnimated(this.lastOfDay(today) ?? newPage(today));
    });
  }

  /** Opens a page (turning the sheets, or at once with `animate` set to false). */
  goToPage(id: string, animate = true) {
    return this.run(async () => {
      const target = this.pages.find((p) => p.id === id);
      if (!target || target.id === this.current?.id) return;
      if (animate) await this.openAnimated(target);
      else await this.open(target, 0);
    });
  }

  /** New sheet for today (after the existing ones). */
  addPage() {
    return this.run(async () => {
      const current = this.current;
      const today = todayKey();
      // A blank sheet is already open: no need for another one.
      if (current && current.date === today && this.isEmpty && !current.title) return;
      await this.openAnimated(newPage(today));
    });
  }

  // ─── Editing pages ────────────────────────────────────────────

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
   * Marks or unmarks a page as important (adds or removes its tab). Without a color, each
   * newly marked page takes the next free color.
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

  /** Gives a page its own paper (null: back to the whole diary's). */
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

  /** Next tab color: the least used one (in order, on a tie). */
  nextBookmarkColor(): string {
    const all = [...this.pages, ...(this.current ? [this.current] : [])];
    const uses = (color: string) => all.filter((p) => p.bookmark === color).length;
    return BOOKMARK_COLORS.reduce((best, color) => (uses(color) < uses(best) ? color : best));
  }

  /** Deletes a page. Returns what was deleted so it can be restored. */
  remove(id: string): Promise<StoredPage | null> {
    return this.run(async () => {
      const current = this.current;
      if (current?.id !== id) {
        const stored = await deletePage(this.db, id);
        this.pages = this.pages.filter((p) => p.id !== id);
        this.emit();
        return stored;
      }
      // The page stops being saved before deleting it, and the one next to it opens.
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

  /** Draws the book again (e.g. when its look changes). */
  refreshBook() {
    const current = this.current;
    if (!current) return;
    this.engine.setBook(this.spreadFor(current));
    void this.refreshNeighbors();
  }

  /** Everything written in the diary (with the latest already saved), for searching. */
  texts(): Promise<TextEntry[]> {
    return this.run(async () => {
      await this.flush();
      return listTexts(this.db);
    });
  }

  /** Which pages link to which (with the latest already saved). */
  links(): Promise<PageLink[]> {
    return this.run(async () => {
      await this.flush();
      return listLinks(this.db);
    });
  }

  /**
   * Redoes old thumbnails (content only) in the background as double pages, which is how
   * they look in the map and when flying to the book.
   */
  async refreshOldThumbnails() {
    const old = this.pages.filter((p) => !p.thumbnailSpread && p.id !== this.current?.id);
    for (const page of old) {
      if (this.stopped) return;
      const target = await this.targetFor(page);
      if (target.elements.length === 0) continue;
      // With its photos already loaded.
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
   * Today's double page as an image (for the desktop mini diary), with how many tasks are
   * pending. If today has no page yet, a blank one for today.
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

  /** Updates the open page's thumbnail (to see it up to date in the index). */
  refreshThumbnail() {
    const current = this.current;
    if (!current || this.isEmpty) return;
    this.upsert({ ...current, thumbnail: this.renderThumbnail(), thumbnailSpread: true });
  }

  // ─── Backups ──────────────────────────────────────────────────

  /** The whole diary as saved (with the latest already written). */
  dump(): Promise<DiaryDump> {
    return this.run(async () => {
      await this.flush();
      await this.saveThumbnail();
      return dumpDiary(this.db);
    });
  }

  /**
   * Restores a backup of the diary. Returns how many pages came in and whether the desk
   * changed.
   */
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
        // The open page changed: it is loaded again without saving over it.
        await this.autosave?.stop();
        this.autosave = null;
        await this.open(this.pages.find((p) => p.id === current.id) ?? current, 0);
      } else this.emit();
      return { pages: merged.length - (desk ? 1 : 0), desk };
    });
  }

  /**
   * Applies changes from the cloud (`apply` writes them). Whatever is pending here is
   * saved first, so a newer change here wins over an older one from there; then the index
   * catches up and, if the open page or the desk changed, they are loaded again.
   */
  applyRemote(apply: () => Promise<AppliedChanges>): Promise<AppliedChanges> {
    return this.run(async () => {
      await this.flush();
      const applied = await apply();
      if (applied.pages.size === 0 && !applied.assets) return applied;
      if (applied.pages.has(DESK_ID) || applied.assets) {
        await this.loadDesk();
        this.hooks.onDeskSaved?.();
      }
      this.loaded.clear();
      this.pages = (await listPages(this.db)).map(toMeta);
      const current = this.current;
      const stillThere = current && this.pages.find((p) => p.id === current.id);
      if (current && (applied.pages.has(current.id) || applied.assets)) {
        await this.autosave?.stop();
        this.autosave = null;
        // Deleted on another device: today's page opens instead.
        const today = todayKey();
        await this.open(stillThere ?? this.lastOfDay(today) ?? newPage(today), 0);
      } else this.emit();
      void this.refreshOldThumbnails();
      return applied;
    });
  }

  /**
   * Replaces the whole diary with a backup (pages and desk). Whatever was pending here is
   * saved first, so the caller can keep a copy of it; the open page is then dropped
   * without saving it back, and today's page opens. Returns how many pages came in.
   */
  replace(dump: DiaryDump, track = true): Promise<number> {
    return this.run(async () => {
      await this.autosave?.stop();
      this.autosave = null;
      this.current = null;
      this.blankToday = null;
      await replaceDiary(this.db, dump, track);
      await this.loadDesk();
      this.hooks.onDeskSaved?.();
      this.loaded.clear();
      this.pages = (await listPages(this.db)).map(toMeta);
      const today = todayKey();
      await this.open(this.lastOfDay(today) ?? newPage(today), 0);
      return this.pages.length;
    });
  }

  /**
   * Puts the saved desk back (without counting it as a change to save): the desktop layer
   * changed it.
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

  // ─── Internal ─────────────────────────────────────────────────

  /** Tasks are queued: two pages are never loaded at the same time. */
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
    // Whatever was being written stays on the page being left.
    this.engine.finishEditing(false);
    const speed = this.hooks.turnSpeed?.() ?? 'normal';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (direction !== 0 && speed !== 'off' && !reduced) {
      // The sheet turns by itself, showing the whole double page, and stays down while
      // the new one loads.
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

  /** Finishes turning the page released by dragging the corner. */
  private completeTurn(dir: TurnDirection) {
    return this.run(async () => {
      const current = this.current;
      const target = current && this.neighborsOf(current)[dir === 1 ? 'next' : 'prev'];
      if (target) await this.open(target, 0);
      else this.engine.endPageTurn();
    });
  }

  /** Previous and next page. Today is always on the way, even if it has no page. */
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

  /** How a day's double page looks: date, page number and thickness. */
  private spreadFor(page: PageMeta): BookSpread {
    const others = this.pages.filter((p) => p.id !== page.id && p.id !== this.current?.id);
    const all = sortPages(
      this.current && this.current.id !== page.id
        ? [...others, this.current, page]
        : [...others, page],
    );
    const index = all.findIndex((p) => p.id === page.id);
    // Tabs: those before this page stick out on the left; the rest, on the right.
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
      labels: t().book,
      pageNumber: index * 2 + 1,
    };
  }

  /** What is needed to draw another page while turning to it. */
  private async targetFor(page: PageMeta): Promise<TurnTarget> {
    let elements = this.loaded.get(page.id);
    if (!elements) {
      const saved = this.pages.some((p) => p.id === page.id);
      elements = saved
        ? loadPage(this.db, page.id).then((data) => {
            // Its images, without saving them again.
            for (const asset of data.assets) this.engine.assets.add(asset.src, asset.id, false);
            return data.elements;
          })
        : Promise.resolve([]);
      this.loaded.set(page.id, elements);
    }
    return { id: page.id, elements: await elements.catch(() => []), book: this.spreadFor(page) };
  }

  /** Prepares the neighbouring pages to be able to turn to them by dragging the corner. */
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

  /** Closes the open page: saves it with its thumbnail or discards it if it is empty. */
  private async leave() {
    const autosave = this.autosave;
    const page = this.current;
    if (!autosave || !page) return;
    this.autosave = null;
    await autosave.stop();
    // What was loaded for this page is no longer valid: it may have changed while it was
    // open.
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
    // The open page shows in the index as soon as it has something (or a title).
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
