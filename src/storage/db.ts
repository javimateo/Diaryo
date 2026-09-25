import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Camera } from '../engine/camera';
import { parseElement } from '../engine/clipboard';
import type { PaperStyle } from '../engine/book';
import type { SceneElement } from '../engine/elements';
import { dayKey } from '../lib/dates';

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

  constructor(name = 'diaryo') {
    super(name);
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
  }
}

/**
 * The desk: what is outside the book, shared by the whole diary. It is saved as one more
 * page (so it goes into backups), but it doesn't show in the index.
 */
export const DESK_ID = 'desk';
export const DESK_INFO: PageInfo = { id: DESK_ID, date: '0000-01-01', order: 0, title: '' };

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
}

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
  await db.transaction('rw', [db.pages, db.elements, db.assets, db.fonts], async () => {
    const page = (await db.pages.get(pageId)) ?? newRow(info, now);
    await db.pages.put({ ...page, updatedAt: now, camera: save.camera ?? page.camera });
    if (save.upserts.length > 0) {
      await db.elements.bulkPut(save.upserts.map((data) => ({ pageId, id: data.id, data })));
    }
    if (save.deletes.length > 0) {
      await db.elements.bulkDelete(save.deletes.map((id) => [pageId, id] as [string, string]));
    }
    if (save.assets.length > 0) await db.assets.bulkPut(save.assets);
    if (save.fonts.length > 0) await db.fonts.bulkPut(save.fonts);
  });
}

/** All the saved pages (without their elements or the desk). */
export async function listPages(db: DiaryoDB): Promise<PageRow[]> {
  return (await db.pages.toArray()).filter((page) => page.id !== DESK_ID);
}

/** Changes a page's data (title, thumbnail…). Creates it if it didn't exist yet. */
export async function updatePage(
  db: DiaryoDB,
  info: PageInfo,
  patch: Partial<Pick<PageRow, 'title' | 'thumbnail' | 'thumbnailSpread' | 'bookmark' | 'paper'>>,
) {
  await db.transaction('rw', db.pages, async () => {
    const page = (await db.pages.get(info.id)) ?? newRow(info, Date.now());
    await db.pages.put({ ...page, ...patch });
  });
}

/** A whole page exactly as saved (to delete it and be able to restore it). */
export interface StoredPage {
  page: PageRow;
  elements: ElementRow[];
}

export async function deletePage(db: DiaryoDB, pageId: string): Promise<StoredPage | null> {
  return db.transaction('rw', [db.pages, db.elements], async () => {
    const page = await db.pages.get(pageId);
    if (!page) return null;
    const elements = await db.elements.where('pageId').equals(pageId).toArray();
    await db.elements.where('pageId').equals(pageId).delete();
    await db.pages.delete(pageId);
    return { page, elements };
  });
}

export async function restorePage(db: DiaryoDB, stored: StoredPage) {
  await db.transaction('rw', [db.pages, db.elements], async () => {
    await db.pages.put(stored.page);
    await db.elements.bulkPut(stored.elements);
  });
}

/** Deletes empty untitled pages (e.g. if the app was closed before doing it). */
export async function pruneEmptyPages(db: DiaryoDB, keep?: string): Promise<string[]> {
  return db.transaction('rw', [db.pages, db.elements], async () => {
    const pages = await db.pages.toArray();
    const removed: string[] = [];
    for (const page of pages) {
      if (page.id === keep || page.id === DESK_ID || page.title || page.bookmark || page.paper) {
        continue;
      }
      const count = await db.elements.where('pageId').equals(page.id).count();
      if (count === 0) {
        await db.pages.delete(page.id);
        removed.push(page.id);
      }
    }
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
      list.push(row);
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
  return db.transaction('rw', [db.pages, db.elements, db.assets, db.fonts], async () => {
    const merged: string[] = [];
    for (const { page, elements } of dump.pages) {
      const local = await db.pages.get(page.id);
      if (page.id === DESK_ID) {
        const here = await db.elements.where('pageId').equals(DESK_ID).toArray();
        const ids = new Set(here.map((row) => row.id));
        const copyIsNewer = !local || page.updatedAt > local.updatedAt;
        const incoming = elements.filter((row) => copyIsNewer || !ids.has(row.id));
        if (incoming.length === 0) continue;
        await db.elements.bulkPut(incoming.map((row) => ({ ...row, pageId: DESK_ID })));
        await db.pages.put(
          local ? { ...local, updatedAt: Math.max(local.updatedAt, page.updatedAt) } : page,
        );
        merged.push(DESK_ID);
        continue;
      }
      if (local && local.updatedAt >= page.updatedAt) continue;
      await db.elements.where('pageId').equals(page.id).delete();
      await db.pages.put(page);
      await db.elements.bulkPut(elements.map((row) => ({ ...row, pageId: page.id })));
      merged.push(page.id);
    }
    if (dump.assets.length > 0) await db.assets.bulkPut(dump.assets);
    if (dump.fonts.length > 0) await db.fonts.bulkPut(dump.fonts);
    return merged;
  });
}

/** A link from one page to another (to draw the diary map). */
export interface PageLink {
  from: string;
  to: string;
}

/** Which pages link to which (without repeats and without counting the desk). */
export async function listLinks(db: DiaryoDB): Promise<PageLink[]> {
  const rows = await db.elements.filter((row) => typeof row.data?.link === 'string').toArray();
  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const row of rows) {
    const to = row.data.link!;
    const key = `${row.pageId}>${to}`;
    if (row.pageId === DESK_ID || to === row.pageId || seen.has(key)) continue;
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
    const text = rowText(row.data);
    if (typeof text !== 'string' || !text.trim()) return;
    entries.push({ pageId: row.pageId, elementId: row.id, type: row.data.type, text });
  });
  return entries;
}

/** A single database for the whole app. */
let instance: DiaryoDB | null = null;
export const getDB = () => (instance ??= new DiaryoDB());
