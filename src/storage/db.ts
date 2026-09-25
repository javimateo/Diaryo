import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Camera } from '../engine/camera';
import { parseElement } from '../engine/clipboard';
import type { PaperStyle } from '../engine/book';
import type { SceneElement } from '../engine/elements';
import { dayKey } from '../diary/dates';

export interface PageRow {
  id: string;
  /** Día del diario al que pertenece (AAAA-MM-DD, hora local). */
  date: string;
  /** Orden dentro del día (se usa el momento de creación). */
  order: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  camera: Camera | null;
  /** Miniatura para el índice (data URL), o null si no hay. */
  thumbnail: string | null;
  /** Página marcada como importante: color de su pestaña (null = sin marcar). */
  bookmark?: string | null;
  /** La miniatura es la doble página entera (las antiguas eran solo el contenido). */
  thumbnailSpread?: boolean;
  /** Hoja propia de esta página (null = la de todo el diario). */
  paper?: PaperStyle | null;
}

/** Lo que define una página en el diario (sin lo que se guarda solo). */
export type PageInfo = Pick<PageRow, 'id' | 'date' | 'order' | 'title'>;

/** Cada elemento se guarda por separado: al cambiar uno solo se escribe ese. */
export interface ElementRow {
  pageId: string;
  id: string;
  data: SceneElement;
}

export interface AssetRow {
  id: string;
  /** Imagen como data URL. */
  src: string;
}

export interface FontRow {
  id: string;
  name: string;
  src: string;
}

/** Base de datos local del navegador (IndexedDB). */
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
    // Fase 6: páginas del diario con día, orden y miniatura.
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

/** La mesa: lo que queda fuera del libro, común a todo el diario. Se guarda como una
 * página más (así entra en las copias), pero no sale en el índice. */
export const DESK_ID = 'desk';
export const DESK_INFO: PageInfo = { id: DESK_ID, date: '0000-01-01', order: 0, title: '' };

export interface LoadedPage {
  elements: SceneElement[];
  assets: AssetRow[];
  fonts: FontRow[];
  camera: Camera | null;
}

/**
 * Lee una página entera. Cada elemento se valida (con valores por defecto para lo
 * guardado por versiones anteriores); lo que no se entiende se descarta.
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

/** Fila nueva de una página que aún no estaba guardada. */
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
 * Escribe un lote de cambios de una vez (todo o nada). La página se crea al guardar
 * por primera vez; si ya existe, se respetan su día, orden y título.
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

/** Todas las páginas guardadas (sin sus elementos ni la mesa). */
export async function listPages(db: DiaryoDB): Promise<PageRow[]> {
  return (await db.pages.toArray()).filter((page) => page.id !== DESK_ID);
}

/** Cambia datos de una página (título, miniatura…). La crea si aún no existía. */
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

/** Una página completa tal cual está guardada (para borrarla y poder recuperarla). */
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

/** Borra las páginas vacías y sin título (p. ej. si se cerró la app antes de hacerlo). */
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

/** Todo el diario, para guardar una copia completa. */
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
 * Recupera una copia del diario sin perder nada reciente: cada página de la copia
 * entra si no existe aquí o si la de la copia es más nueva. La mesa, que es una para
 * todo el diario, se junta con la de aquí: entra todo lo que falte y, si algo está en
 * las dos, gana la mesa más reciente. Devuelve las páginas que cambiaron (y la mesa).
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

/** Un enlace de una página a otra (para dibujar el mapa del diario). */
export interface PageLink {
  from: string;
  to: string;
}

/** Qué páginas enlazan con cuáles (sin repetir y sin contar la mesa). */
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

/** Algo escrito en el diario (para buscar): un texto, una nota o lo de dentro de una figura. */
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

/** Todo lo escrito en el diario, también en la mesa. */
export async function listTexts(db: DiaryoDB): Promise<TextEntry[]> {
  const entries: TextEntry[] = [];
  await db.elements.each((row) => {
    const text = rowText(row.data);
    if (typeof text !== 'string' || !text.trim()) return;
    entries.push({ pageId: row.pageId, elementId: row.id, type: row.data.type, text });
  });
  return entries;
}
