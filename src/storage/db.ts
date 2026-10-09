import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Camera } from '../engine/camera';
import { parseElement } from '../engine/clipboard';
import type { PaperStyle } from '../engine/book';
import type { SceneElement } from '../engine/elements';
import { dayKey } from '../lib/dates';
import {
  keptClear,
  LockedError,
  privateForTransport,
  rowIsSealed,
  sealingMiddleware,
  type Sealing,
} from './sealing';
import {
  assetPath,
  elementPath,
  fontPath,
  pagePath,
  touch,
  untouched,
  type TrackedRow,
} from './tracking';

export interface PageRow {
  id: string;
  /** Diary day it belongs to (YYYY-MM-DD, local time). */
  date: string;
  /** Order within the day (the creation time is used). */
  order: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  camera: Camera | null;
  /** Thumbnail for the index (data URL), or null if there is none. */
  thumbnail: string | null;
  /** Page marked as important: color of its tab (null = not marked). */
  bookmark?: string | null;
  /** The thumbnail is the whole double page (older ones were only the content). */
  thumbnailSpread?: boolean;
  /** This page's own paper (null = the whole diary's). */
  paper?: PaperStyle | null;
}

/** What defines a page in the diary (without what is saved on its own). */
export type PageInfo = Pick<PageRow, 'id' | 'date' | 'order' | 'title'>;

/** Each element is saved separately: changing one only writes that one. */
export interface ElementRow {
  pageId: string;
  id: string;
  data: SceneElement;
}

export interface AssetRow {
  id: string;
  /** Image as a data URL. */
  src: string;
}

export interface FontRow {
  id: string;
  name: string;
  src: string;
}

/** The browser's local database (IndexedDB). */
export class DiaryoDB extends Dexie {
  pages!: EntityTable<PageRow, 'id'>;
  elements!: Table<ElementRow, [string, string]>;
  assets!: EntityTable<AssetRow, 'id'>;
  fonts!: EntityTable<FontRow, 'id'>;
  /** What changed and when, for the cloud sync (see tracking.ts). */
  tracked!: EntityTable<TrackedRow, 'path'>;
  /** Whether the diary is encrypted on this device, and its key (see sealing.ts). */
  readonly sealing: Sealing = { key: null, seal: false };

  constructor(name = 'diaryo') {
    super(name);
    this.use(sealingMiddleware(this.sealing));
    this.version(1).stores({
      pages: 'id, updatedAt',
      elements: '[pageId+id], pageId',
      assets: 'id',
      fonts: 'id',
    });
    // Phase 6: diary pages with day, order and thumbnail.
    this.version(2)
      .stores({ pages: 'id, date, updatedAt' })
      .upgrade((tx) =>
        tx
          .table('pages')
          .toCollection()
          .modify((page: Partial<PageRow>) => {
            const created = page.createdAt ?? Date.now();
            page.date ??= dayKey(new Date(created));
            page.order ??= created;
            page.title ??= '';
            page.thumbnail ??= null;
          }),
      );
    // Phase 12-C: the cloud sync knows what changed.
    this.version(3).stores({ tracked: 'path, dirty, remote' });
  }
}

/**
 * The desk: what is outside the book, shared by the whole diary. It is saved as one more
 * page (so it goes into backups), but it doesn't show in the index.
 */
export const DESK_ID = 'desk';
export const DESK_INFO: PageInfo = { id: DESK_ID, date: '0000-01-01', order: 0, title: '' };

/**
 * The cover: what is stuck on the closed diary's front cover. One more page too (backups,
 * the cloud), out of the index and the search. Its thumbnail is the cover as an image.
 */
export const COVER_ID = 'cover';
export const COVER_INFO: PageInfo = { id: COVER_ID, date: '0000-01-01', order: 0, title: '' };

/** Pages that aren't a day of the diary. */
const special = (id: string) => id === DESK_ID || id === COVER_ID;

export interface LoadedPage {
  elements: SceneElement[];
  assets: AssetRow[];
  fonts: FontRow[];
  camera: Camera | null;
}

/**
 * Reads a whole page. Each element is validated (with defaults for what older versions
 * saved); anything that can't be understood is discarded.
 */
export async function loadPage(db: DiaryoDB, pageId: string): Promise<LoadedPage> {
  const [page, rows, fonts] = await Promise.all([
    db.pages.get(pageId),
    db.elements.where('pageId').equals(pageId).toArray(),
    db.fonts.toArray(),
  ]);
  const assetIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.data?.type === 'image' && typeof row.data.assetId === 'string'
          ? [row.data.assetId]
          : [],
      ),
    ),
  ];
  const assets = (await db.assets.bulkGet(assetIds)).filter((a): a is AssetRow => !!a);
  const available = new Set(assets.map((a) => a.id));
  const elements = rows
    .map((row) => parseElement(row.data, (id) => available.has(id)))
    .filter((el): el is SceneElement => el !== null);
  return { elements, assets, fonts, camera: page?.camera ?? null };
}

export interface PendingSave {
  upserts: SceneElement[];
  deletes: string[];
  assets: AssetRow[];
  fonts: FontRow[];
  camera?: Camera;
  /**
   * The images of the saved image elements: put back only if they are missing (an image
   * deleted and then undone, after its unused file was cleaned up).
   */
  restore?: AssetRow[];
}

/** The tables with the diary itself. */
const all = (db: DiaryoDB) => [db.pages, db.elements, db.assets, db.fonts];

/** New row for a page that wasn't saved yet. */
function newRow(info: PageInfo, now: number): PageRow {
  return {
    ...info,
    createdAt: now,
    updatedAt: now,
    camera: null,
    thumbnail: null,
    bookmark: null,
  };
}

/**
 * Writes a batch of changes at once (all or nothing). The page is created on its first
 * save; if it already exists, its day, order and title are kept.
 */
export async function saveChanges(db: DiaryoDB, info: PageInfo, save: PendingSave) {
  const now = Date.now();
  const pageId = info.id;
  await db.transaction('rw', [...all(db), db.tracked], async () => {
    const existing = await db.pages.get(pageId);
    const page = existing ?? newRow(info, now);
    await db.pages.put({ ...page, updatedAt: now, camera: save.camera ?? page.camera });
    if (save.upserts.length > 0) {
      await db.elements.bulkPut(save.upserts.map((data) => ({ pageId, id: data.id, data })));
    }
    if (save.deletes.length > 0) {
      await db.elements.bulkDelete(save.deletes.map((id) => [pageId, id] as [string, string]));
    }
    if (save.assets.length > 0) await db.assets.bulkPut(save.assets);
    if (save.fonts.length > 0) await db.fonts.bulkPut(save.fonts);
    const restore = save.restore ?? [];
    const present = await db.assets.bulkGet(restore.map((asset) => asset.id));
    const restored = restore.filter((_, i) => !present[i]);
    if (restored.length > 0) await db.assets.bulkPut(restored);
    // Only the camera moving isn't a change for the other devices (the view is each one's).
    const content = save.upserts.length + save.deletes.length > 0;
    await touch(db, [
      ...restored.map((asset) => assetPath(asset.id)),
      ...(content || !existing ? [pagePath(pageId)] : []),
      ...save.upserts.map((el) => elementPath(pageId, el.id)),
      ...save.deletes.map((id) => elementPath(pageId, id)),
      ...save.assets.map((asset) => assetPath(asset.id)),
      ...save.fonts.map((font) => fontPath(font.id)),
    ]);
  });
}

/** All the saved pages (without their elements, the desk or the cover). */
export async function listPages(db: DiaryoDB): Promise<PageRow[]> {
  return (await db.pages.toArray()).filter((page) => !special(page.id));
}

/** The cover as an image, or null (readable even with the diary locked: see sealing.ts). */
export async function coverImage(db: DiaryoDB): Promise<string | null> {
  return (await db.pages.get(COVER_ID))?.thumbnail ?? null;
}

/** Changes a page's data (title, thumbnail…). Creates it if it didn't exist yet. */
export async function updatePage(
  db: DiaryoDB,
  info: PageInfo,
  patch: Partial<Pick<PageRow, 'title' | 'thumbnail' | 'thumbnailSpread' | 'bookmark' | 'paper'>>,
) {
  await db.transaction('rw', [db.pages, db.tracked], async () => {
    const existing = await db.pages.get(info.id);
    const page = existing ?? newRow(info, Date.now());
    await db.pages.put({ ...page, ...patch });
    // The thumbnail is each device's own; the rest goes to the others.
    const shared = 'title' in patch || 'bookmark' in patch || 'paper' in patch;
    if (shared || !existing) await touch(db, [pagePath(info.id)]);
  });
}

/** A whole page exactly as saved (to delete it and be able to restore it). */
export interface StoredPage {
  page: PageRow;
  elements: ElementRow[];
}

export async function deletePage(db: DiaryoDB, pageId: string): Promise<StoredPage | null> {
  return db.transaction('rw', [db.pages, db.elements, db.tracked], async () => {
    const page = await db.pages.get(pageId);
    if (!page) return null;
    const elements = await db.elements.where('pageId').equals(pageId).toArray();
    await db.elements.where('pageId').equals(pageId).delete();
    await db.pages.delete(pageId);
    await touch(db, [pagePath(pageId), ...elements.map((row) => elementPath(pageId, row.id))]);
    return { page, elements };
  });
}

export async function restorePage(db: DiaryoDB, stored: StoredPage) {
  await db.transaction('rw', [db.pages, db.elements, db.tracked], async () => {
    await db.pages.put(stored.page);
    await db.elements.bulkPut(stored.elements);
    await touch(db, [
      pagePath(stored.page.id),
      ...stored.elements.map((row) => elementPath(row.pageId, row.id)),
    ]);
  });
}

/**
 * Deletes the elements left on a page that was deleted on another device (they were
 * written there before the page was deleted, and arrived after). An element changed after
 * the deletion stays: its page comes back with it.
 */
export async function dropOrphanElements(db: DiaryoDB): Promise<number> {
  return db.transaction('rw', [db.pages, db.elements, db.tracked], async () => {
    const pages = new Set(await db.pages.toCollection().primaryKeys());
    const keys = (await db.elements.toCollection().primaryKeys()).filter(
      ([pageId]) => pageId !== DESK_ID && !pages.has(pageId),
    );
    if (keys.length === 0) return 0;
    const deletions = await db.tracked.bulkGet([
      ...new Set(keys.map(([pageId]) => pagePath(pageId))),
    ]);
    const deletedAt = new Map(
      deletions.flatMap((row) => (row ? [[row.path.slice(5), row.modified] as const] : [])),
    );
    const times = await db.tracked.bulkGet(keys.map(([pageId, id]) => elementPath(pageId, id)));
    // Only pages known to be deleted (one not heard of yet may still arrive).
    const orphans = keys.filter(([pageId], i) => {
      const deleted = deletedAt.get(pageId);
      return deleted !== undefined && (times[i]?.modified ?? 0) <= deleted;
    });
    if (orphans.length === 0) return 0;
    await db.elements.bulkDelete(orphans);
    await touch(
      db,
      orphans.map(([pageId, id]) => elementPath(pageId, id)),
    );
    return orphans.length;
  });
}

/** Tidies up what nothing uses (see the two functions above and below). */
export async function cleanUpDiary(db: DiaryoDB) {
  await dropOrphanElements(db);
  await dropUnusedAssets(db);
}

/**
 * Deletes the images no element shows any more (a deleted image keeps its file, so undo
 * can bring it back; the file goes when cleaning up). Returns how many went.
 */
export async function dropUnusedAssets(db: DiaryoDB): Promise<number> {
  return db.transaction('rw', [db.elements, db.assets, db.tracked], async () => {
    const used = new Set<string>();
    await db.elements.each((row) => {
      if (row.data?.type === 'image') used.add(row.data.assetId);
    });
    const unused = (await db.assets.toCollection().primaryKeys()).filter((id) => !used.has(id));
    if (unused.length === 0) return 0;
    await db.assets.bulkDelete(unused);
    await touch(db, unused.map(assetPath));
    return unused.length;
  });
}

/** Deletes empty untitled pages (e.g. if the app was closed before doing it). */
export async function pruneEmptyPages(db: DiaryoDB, keep?: string): Promise<string[]> {
  return db.transaction('rw', [db.pages, db.elements, db.tracked], async () => {
    const pages = await db.pages.toArray();
    const removed: string[] = [];
    for (const page of pages) {
      if (page.id === keep || special(page.id) || page.title || page.bookmark || page.paper) {
        continue;
      }
      const count = await db.elements.where('pageId').equals(page.id).count();
      if (count === 0) {
        await db.pages.delete(page.id);
        removed.push(page.id);
      }
    }
    await touch(db, removed.map(pagePath));
    return removed;
  });
}

/** The whole diary, to save a full backup. */
export interface DiaryDump {
  pages: StoredPage[];
  assets: AssetRow[];
  fonts: FontRow[];
}

export async function dumpDiary(db: DiaryoDB): Promise<DiaryDump> {
  return db.transaction('r', [db.pages, db.elements, db.assets, db.fonts], async () => {
    const [pages, elements, fonts] = await Promise.all([
      db.pages.toArray(),
      db.elements.toArray(),
      db.fonts.toArray(),
    ]);
    const byPage = new Map<string, ElementRow[]>();
    for (const row of elements) {
      const list = byPage.get(row.pageId) ?? [];
      // In a backup, a private note's text stays encrypted (even in a readable one).
      list.push({ ...row, data: privateForTransport(row.data, db.sealing) as SceneElement });
      byPage.set(row.pageId, list);
    }
    const assetIds = [
      ...new Set(elements.flatMap((row) => (row.data.type === 'image' ? [row.data.assetId] : []))),
    ];
    const assets = (await db.assets.bulkGet(assetIds)).filter((a): a is AssetRow => !!a);
    return {
      pages: pages.map((page) => ({ page, elements: byPage.get(page.id) ?? [] })),
      assets,
      fonts,
    };
  });
}

/**
 * Restores a backup of the diary without losing anything recent: each page of the backup
 * goes in if it doesn't exist here or if the backup's one is newer. The desk, which is
 * one for the whole diary, is merged with this one: everything missing goes in and, if
 * something is in both, the most recent desk wins. Returns the pages that changed (and
 * the desk).
 */
export async function mergeDiary(db: DiaryoDB, dump: DiaryDump): Promise<string[]> {
  return db.transaction('rw', [...all(db), db.tracked], async () => {
    const merged: string[] = [];
    const changed: string[] = [];
    for (const { page, elements } of dump.pages) {
      const local = await db.pages.get(page.id);
      if (page.id === DESK_ID) {
        const here = await db.elements.where('pageId').equals(DESK_ID).toArray();
        const ids = new Set(here.map((row) => row.id));
        const copyIsNewer = !local || page.updatedAt > local.updatedAt;
        const incoming = elements.filter((row) => copyIsNewer || !ids.has(row.id));
        if (incoming.length === 0) continue;
        await db.elements.bulkPut(incoming.map((row) => ({ ...row, pageId: DESK_ID })));
        changed.push(pagePath(DESK_ID), ...incoming.map((row) => elementPath(DESK_ID, row.id)));
        await db.pages.put(
          local ? { ...local, updatedAt: Math.max(local.updatedAt, page.updatedAt) } : page,
        );
        merged.push(DESK_ID);
        continue;
      }
      if (local && local.updatedAt >= page.updatedAt) continue;
      const before = await db.elements.where('pageId').equals(page.id).primaryKeys();
      changed.push(
        pagePath(page.id),
        ...before.map(([pageId, id]) => elementPath(pageId, id)),
        ...elements.map((row) => elementPath(page.id, row.id)),
      );
      await db.elements.where('pageId').equals(page.id).delete();
      await db.pages.put(page);
      await db.elements.bulkPut(elements.map((row) => ({ ...row, pageId: page.id })));
      merged.push(page.id);
    }
    if (dump.assets.length > 0) await db.assets.bulkPut(dump.assets);
    if (dump.fonts.length > 0) await db.fonts.bulkPut(dump.fonts);
    await touch(db, [
      ...new Set(changed),
      ...dump.assets.map((asset) => assetPath(asset.id)),
      ...dump.fonts.map((font) => fontPath(font.id)),
    ]);
    return merged;
  });
}

/**
 * Replaces the whole diary with a backup: pages, desk and images become the backup's.
 * The custom fonts stay (the backup's are added): they are harmless and other copies may
 * use them.
 */
export async function replaceDiary(
  db: DiaryoDB,
  dump: DiaryDump,
  /**
   * Whether the other devices follow (what disappears is deleted there too). Not when the
   * diary is being replaced by the cloud's one.
   */
  track = true,
): Promise<void> {
  await db.transaction('rw', [...all(db), db.tracked], async () => {
    const before = track ? await untouched(db) : [];
    await Promise.all([db.pages.clear(), db.elements.clear(), db.assets.clear()]);
    await db.pages.bulkPut(dump.pages.map(({ page }) => page));
    await db.elements.bulkPut(
      dump.pages.flatMap(({ page, elements }) =>
        elements.map((row) => ({ ...row, pageId: page.id })),
      ),
    );
    if (dump.assets.length > 0) await db.assets.bulkPut(dump.assets);
    if (dump.fonts.length > 0) await db.fonts.bulkPut(dump.fonts);
    if (!track) return db.tracked.clear();
    await touch(db, [
      ...before,
      ...dump.pages.flatMap(({ page, elements }) => [
        pagePath(page.id),
        ...elements.map((row) => elementPath(page.id, row.id)),
      ]),
      ...dump.assets.map((asset) => assetPath(asset.id)),
      ...dump.fonts.map((font) => fontPath(font.id)),
    ]);
  });
}

/** A link from one page to another (to draw the diary map). */
export interface PageLink {
  from: string;
  to: string;
}

/** Which pages link to which (without repeats and without counting the desk or the cover). */
export async function listLinks(db: DiaryoDB): Promise<PageLink[]> {
  const rows = await db.elements.filter((row) => typeof row.data?.link === 'string').toArray();
  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const row of rows) {
    const to = row.data.link!;
    const key = `${row.pageId}>${to}`;
    if (special(row.pageId) || to === row.pageId || seen.has(key)) continue;
    seen.add(key);
    links.push({ from: row.pageId, to });
  }
  return links;
}

/** Something written in the diary (for searching): a text, a note or the text inside a shape. */
export interface TextEntry {
  pageId: string;
  elementId: string;
  type: SceneElement['type'];
  text: string;
}

function rowText(data: SceneElement | undefined): string {
  if (data?.type === 'text' || data?.type === 'note') return data.text;
  if (data?.type === 'shape' || data?.type === 'stroke') return data.label?.text ?? '';
  return '';
}

/** Everything written in the diary, also on the desk. */
export async function listTexts(db: DiaryoDB): Promise<TextEntry[]> {
  const entries: TextEntry[] = [];
  await db.elements.each((row) => {
    // The cover isn't a page to go to.
    if (row.pageId === COVER_ID) return;
    const text = rowText(row.data);
    if (typeof text !== 'string' || !text.trim()) return;
    entries.push({ pageId: row.pageId, elementId: row.id, type: row.data.type, text });
  });
  return entries;
}

const isPrivateRow = (row: ElementRow) => row.data?.type === 'note' && row.data.private === true;

/** How many private notes the diary has (shown or not). */
export const countPrivateNotes = (db: DiaryoDB) => db.elements.filter(isPrivateRow).count();

/** The private notes' ids: all of them, or a page's (hidden or not). */
export async function privateNoteIds(db: DiaryoDB, pageId?: string): Promise<string[]> {
  const rows = pageId
    ? db.elements.where('pageId').equals(pageId).filter(isPrivateRow)
    : db.elements.filter(isPrivateRow);
  return (await rows.toArray()).map((row) => row.id);
}

/**
 * The private notes stop being private (`open`: they need to be shown, their text goes
 * in the clear) or are deleted. The other devices follow. Returns how many.
 */
export async function releasePrivateNotes(db: DiaryoDB, how: 'open' | 'delete') {
  return db.transaction('rw', [db.elements, db.tracked], async () => {
    const rows = await db.elements.filter(isPrivateRow).toArray();
    const keys = rows.map((row) => [row.pageId, row.id] as [string, string]);
    if (how === 'delete') await db.elements.bulkDelete(keys);
    else {
      if (rows.some((row) => row.data.type === 'note' && row.data.concealed)) {
        throw new LockedError();
      }
      await db.elements.bulkPut(
        rows.map((row) => ({ ...row, data: { ...row.data, private: undefined } })),
      );
    }
    await touch(
      db,
      rows.map((row) => elementPath(row.pageId, row.id)),
    );
    return rows.length;
  });
}

/**
 * The private notes' text goes from one key to another (the diary's password became
 * another diary's, see cloud/vault.ts). The other devices follow.
 */
export async function reboxPrivateNotes(db: DiaryoDB, from: Uint8Array, to: Uint8Array) {
  const before = db.sealing.privateKey;
  try {
    db.sealing.privateKey = from;
    const rows = await db.elements.filter(isPrivateRow).toArray();
    db.sealing.privateKey = to;
    await db.transaction('rw', [db.elements, db.tracked], async () => {
      await db.elements.bulkPut(rows);
      await touch(
        db,
        rows.map((row) => elementPath(row.pageId, row.id)),
      );
    });
  } finally {
    db.sealing.privateKey = before;
  }
}

/** The images on the desk (they stay in the clear with it, see sealing.ts). */
export async function deskAssetIds(db: DiaryoDB): Promise<Set<string>> {
  const rows = await db.elements.where('pageId').equals(DESK_ID).toArray();
  return new Set(rows.flatMap((row) => (row.data.type === 'image' ? [row.data.assetId] : [])));
}

/** The rows as IndexedDB keeps them (without the sealing): whether each one is sealed. */
function sealedNow(db: DiaryoDB, table: string): Promise<Map<IDBValidKey, boolean>> {
  return new Promise((resolve, reject) => {
    const store = db.backendDB().transaction(table).objectStore(table);
    const found = new Map<IDBValidKey, boolean>();
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(found);
      found.set(cursor.primaryKey, rowIsSealed(cursor.value));
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * With the whole diary encrypted, the desk can stay out of it or go back in (see
 * sealing.ts): its rows, its images and the fonts that aren't as they should be are
 * written again (also an image that left the desk, sealed again). Needs the key.
 */
export async function matchDesk(db: DiaryoDB) {
  const { sealing } = db;
  sealing.deskAssets = await deskAssetIds(db);
  if (!sealing.seal) return;
  for (const table of [db.pages, db.elements, db.assets, db.fonts] as Table<
    unknown,
    IDBValidKey
  >[]) {
    const now = await sealedNow(db, table.name);
    const wrong = [];
    for (const [key, sealed] of now) {
      const row = table.schema.primKey.keyPath
        ? Object.fromEntries(
            ([] as string[])
              .concat(table.schema.primKey.keyPath as string | string[])
              .map((field, i) => [field, Array.isArray(key) ? key[i] : key]),
          )
        : {};
      if (sealed === keptClear(sealing, table.name, row)) wrong.push(key);
    }
    for (let start = 0; start < wrong.length; start += REWRITE_BATCH) {
      const batch = wrong.slice(start, start + REWRITE_BATCH);
      await db.transaction('rw', table, async () => {
        const rows = (await table.bulkGet(batch)).filter((row) => row !== undefined);
        await table.bulkPut(rows);
      });
    }
  }
}

const REWRITE_BATCH = 100;

/**
 * Writes the whole diary again as `db.sealing` says (encrypted or in the clear), in
 * batches: a rewrite cut halfway is carried on by running it again. It isn't a change
 * for the other devices.
 */
export async function rewriteDiary(
  db: DiaryoDB,
  onProgress?: (done: number, total: number) => void,
) {
  const tables = all(db) as Table<unknown, unknown>[];
  const keys = await Promise.all(tables.map((table) => table.toCollection().primaryKeys()));
  const total = keys.reduce((sum, list) => sum + list.length, 0);
  let done = 0;
  for (const [i, table] of tables.entries()) {
    for (let start = 0; start < keys[i].length; start += REWRITE_BATCH) {
      const batch = keys[i].slice(start, start + REWRITE_BATCH);
      await db.transaction('rw', table, async () => {
        const rows = (await table.bulkGet(batch)).filter((row) => row !== undefined);
        await table.bulkPut(rows);
      });
      done += batch.length;
      onProgress?.(done, total);
    }
  }
}

/** A single database for the whole app. */
let instance: DiaryoDB | null = null;
export const getDB = () => (instance ??= new DiaryoDB());
