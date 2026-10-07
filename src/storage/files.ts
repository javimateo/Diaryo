import { isPaperStyle } from '../engine/book';
import { parseElement } from '../engine/clipboard';
import type { SceneElement } from '../engine/elements';
import type { AssetRow, DiaryDump, FontRow, PageRow, StoredPage } from './db';

/** Backup format: a readable JSON with everything needed to restore it. */
const FILE_TYPE = 'diaryo/page';
const DIARY_TYPE = 'diaryo/diary';
export const FILE_EXTENSION = '.diaryo';

export interface PageFile {
  elements: SceneElement[];
  assets: AssetRow[];
  fonts: FontRow[];
}

export function serializePage(page: PageFile): string {
  return JSON.stringify({
    type: FILE_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    elements: page.elements,
    assets: Object.fromEntries(page.assets.map((a) => [a.id, a.src])),
    fonts: page.fonts,
  });
}

/** Backup of the whole diary: each page with its elements. */
export function serializeDiary(dump: DiaryDump): string {
  return JSON.stringify({
    type: DIARY_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: dump.pages.map(({ page, elements }) => ({
      ...page,
      elements: elements.map((row) => row.data),
    })),
    assets: Object.fromEntries(dump.assets.map((a) => [a.id, a.src])),
    fonts: dump.fonts,
  });
}

export type Backup = { kind: 'page'; page: PageFile } | { kind: 'diary'; diary: DiaryDump };

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function parseAssets(raw: unknown): AssetRow[] {
  const assets: AssetRow[] = [];
  if (raw && typeof raw === 'object') {
    for (const [id, src] of Object.entries(raw)) {
      if (typeof src === 'string' && src.startsWith('data:image/')) assets.push({ id, src });
    }
  }
  return assets;
}

/** The fonts' files go inside the backup (a data URL): one that points elsewhere isn't read. */
function parseFonts(raw: unknown): FontRow[] {
  return Array.isArray(raw)
    ? raw.filter(
        (f): f is FontRow =>
          typeof f?.id === 'string' &&
          typeof f?.name === 'string' &&
          typeof f?.src === 'string' &&
          f.src.startsWith('data:'),
      )
    : [];
}

function parseElements(raw: unknown[], assets: AssetRow[]): SceneElement[] {
  const available = new Set(assets.map((a) => a.id));
  return raw
    .map((item) => parseElement(item, (id) => available.has(id)))
    .filter((el): el is SceneElement => el !== null);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A page's id as diaryo makes them (a UUID, or `desk`): anything else isn't from diaryo. */
const PAGE_ID = /^[\w-]{1,64}$/;
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function parseStoredPage(raw: unknown, assets: AssetRow[]): StoredPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (
    typeof data.id !== 'string' ||
    !PAGE_ID.test(data.id) ||
    typeof data.date !== 'string' ||
    !DAY.test(data.date)
  ) {
    return null;
  }
  const camera = data.camera as PageRow['camera'];
  const now = Date.now();
  const page: PageRow = {
    id: data.id,
    date: data.date,
    order: num(data.order, now),
    title: typeof data.title === 'string' ? data.title : '',
    createdAt: num(data.createdAt, now),
    updatedAt: num(data.updatedAt, now),
    camera:
      camera && [camera.x, camera.y, camera.zoom].every((n) => Number.isFinite(n)) ? camera : null,
    bookmark:
      typeof data.bookmark === 'string' && /^#[0-9a-f]{6}$/i.test(data.bookmark)
        ? data.bookmark
        : null,
    paper: isPaperStyle(data.paper) ? data.paper : null,
    thumbnail:
      typeof data.thumbnail === 'string' && data.thumbnail.startsWith('data:image/')
        ? data.thumbnail
        : null,
  };
  const elements = Array.isArray(data.elements) ? parseElements(data.elements, assets) : [];
  return { page, elements: elements.map((el) => ({ pageId: page.id, id: el.id, data: el })) };
}

/** Reads a backup (of one page or of the whole diary). Returns null if it isn't from diaryo. */
export function parseBackup(text: string): Backup | null {
  const data = parseJson(text);
  if (!data) return null;
  const assets = parseAssets(data.assets);
  const fonts = parseFonts(data.fonts);
  if (data.type === FILE_TYPE && Array.isArray(data.elements)) {
    return {
      kind: 'page',
      page: { elements: parseElements(data.elements, assets), assets, fonts },
    };
  }
  if (data.type === DIARY_TYPE && Array.isArray(data.pages)) {
    const pages = data.pages
      .map((raw) => parseStoredPage(raw, assets))
      .filter((p): p is StoredPage => p !== null);
    return { kind: 'diary', diary: { pages, assets, fonts } };
  }
  return null;
}

/** Reads the backup of a single page. Returns null if it isn't one. */
export function parsePage(text: string): PageFile | null {
  const backup = parseBackup(text);
  return backup?.kind === 'page' ? backup.page : null;
}

/** Downloads a file in the browser. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "diaryo-2026-09-24" to name the backups. */
export function datedName(prefix = 'diaryo'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
