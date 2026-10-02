import Dexie from 'dexie';
import { now as clockNow } from '../lib/clock';
import type { SceneElement } from '../engine/elements';
import type { AssetRow, DiaryoDB, FontRow, PageRow } from './db';

/**
 * What changed and when, for the cloud sync (docs/cloud.md). Every write to the diary
 * notes, in the same transaction, the things it touched by their **path**:
 *
 * - `page/<id>`: a page (or the desk) — its date, order, title, bookmark and paper;
 * - `el/<page>/<id>`: one element;
 * - `asset/<id>`: an image; `font/<id>`: a custom font.
 *
 * Each path keeps the time of its latest change (`modified`, which decides which change
 * wins), whether it still has to be pushed (`dirty`) and its record on the server.
 * A path whose row no longer exists is a deletion (a tombstone, once pushed).
 */
export interface TrackedRow {
  path: string;
  modified: number;
  /** 1: changed here and not pushed yet (0 otherwise; IndexedDB can't index booleans). */
  dirty: 0 | 1;
  /** Its record on the server, once known. */
  remote?: string;
}

export const pagePath = (id: string) => `page/${id}`;
export const elementPath = (pageId: string, id: string) => `el/${pageId}/${id}`;
export const assetPath = (id: string) => `asset/${id}`;
export const fontPath = (id: string) => `font/${id}`;

export type PathKind = 'page' | 'el' | 'asset' | 'font';

/** What a path points to. */
export function parsePath(path: string): { kind: PathKind; id: string; pageId?: string } | null {
  const [kind, ...rest] = path.split('/');
  if (kind === 'el' && rest.length >= 2) {
    return { kind, pageId: rest[0], id: rest.slice(1).join('/') };
  }
  if ((kind === 'page' || kind === 'asset' || kind === 'font') && rest.length >= 1) {
    return { kind, id: rest.join('/') };
  }
  return null;
}

/**
 * Who is told about the changes made here, once they are written (the cloud sync, to push
 * them and tell the other tabs). Changes from the cloud aren't told.
 */
let listener: ((paths: string[]) => void) | null = null;

export function onLocalChanges(next: ((paths: string[]) => void) | null) {
  listener = next;
}

/** Tells the listener when the transaction that wrote them ends (not before: it may fail). */
function tell(paths: string[]) {
  if (!listener) return;
  const notify = listener;
  let tx = Dexie.currentTransaction;
  while (tx?.parent) tx = tx.parent;
  if (tx) tx.on('complete', () => notify(paths));
  else notify(paths);
}

/**
 * Notes changes made now (inside the write's transaction). A change is always later than
 * the one it replaces, even if this device's clock is behind the one that made it.
 */
export async function touch(db: DiaryoDB, paths: string[], now = clockNow()) {
  if (paths.length === 0) return;
  const unique = [...new Set(paths)];
  const known = await db.tracked.bulkGet(unique);
  await db.tracked.bulkPut(
    unique.map((path, i) => ({
      path,
      modified: Math.max(now, (known[i]?.modified ?? 0) + 1),
      dirty: 1 as const,
      remote: known[i]?.remote,
    })),
  );
  tell(unique);
}

/** Every path the diary has now. */
export async function untouched(db: DiaryoDB): Promise<string[]> {
  const [pages, elements, assets, fonts] = await Promise.all([
    db.pages.toCollection().primaryKeys(),
    db.elements.toCollection().primaryKeys(),
    db.assets.toCollection().primaryKeys(),
    db.fonts.toCollection().primaryKeys(),
  ]);
  return [
    ...pages.map(pagePath),
    ...elements.map(([pageId, id]) => elementPath(pageId, id)),
    ...assets.map(assetPath),
    ...fonts.map(fontPath),
  ];
}

// ─── For the sync ───────────────────────────────────────────────

/** What a page shares with the other devices (not the view nor the thumbnail). */
export type SharedPage = Pick<
  PageRow,
  'id' | 'date' | 'order' | 'title' | 'createdAt' | 'updatedAt' | 'bookmark' | 'paper'
>;

const sharedPage = (page: PageRow): SharedPage => ({
  id: page.id,
  date: page.date,
  order: page.order,
  title: page.title,
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
  bookmark: page.bookmark ?? null,
  paper: page.paper ?? null,
});

/** The content of a path as the other devices get it, or null if it was deleted. */
export async function readPath(db: DiaryoDB, path: string): Promise<unknown> {
  const target = parsePath(path);
  if (!target) return null;
  if (target.kind === 'page') {
    const page = await db.pages.get(target.id);
    return page ? sharedPage(page) : null;
  }
  if (target.kind === 'el') {
    const row = await db.elements.get([target.pageId!, target.id]);
    return row ? row.data : null;
  }
  if (target.kind === 'asset') return (await db.assets.get(target.id)) ?? null;
  return (await db.fonts.get(target.id)) ?? null;
}

/** What still has to be pushed. */
export const dirtyPaths = (db: DiaryoDB) => db.tracked.where('dirty').equals(1).toArray();

/**
 * A change was pushed: it is clean, unless it changed again meanwhile (then only its
 * record is remembered, and it goes up again).
 */
export async function markPushed(db: DiaryoDB, path: string, modified: number, remote: string) {
  await db.transaction('rw', db.tracked, async () => {
    const row = await db.tracked.get(path);
    if (!row) return;
    await db.tracked.put({ ...row, remote, dirty: row.modified === modified ? 0 : row.dirty });
  });
}

/** It is known that the server has a newer version: this one doesn't need to go up. */
export async function markStale(db: DiaryoDB, path: string, modified: number) {
  await db.transaction('rw', db.tracked, async () => {
    const row = await db.tracked.get(path);
    if (row?.modified === modified) await db.tracked.put({ ...row, dirty: 0 });
  });
}

/**
 * The whole diary is to be pushed (the first sync with an account): every path, with the
 * time of its page's last change; the server records of another account are forgotten.
 */
export async function trackEverything(db: DiaryoDB) {
  await db.transaction('rw', [db.pages, db.elements, db.assets, db.fonts, db.tracked], async () => {
    const pages = await db.pages.toArray();
    const updated = new Map(pages.map((page) => [page.id, page.updatedAt]));
    const elements = await db.elements.toCollection().primaryKeys();
    const assets = await db.assets.toCollection().primaryKeys();
    const fonts = await db.fonts.toCollection().primaryKeys();
    await db.tracked.clear();
    const rows: TrackedRow[] = [
      ...pages.map((page) => ({
        path: pagePath(page.id),
        modified: page.updatedAt,
        dirty: 1 as const,
      })),
      ...elements.map(([pageId, id]) => ({
        path: elementPath(pageId, id),
        modified: updated.get(pageId) ?? 1,
        dirty: 1 as const,
      })),
      ...assets.map((id) => ({ path: assetPath(id), modified: 1, dirty: 1 as const })),
      ...fonts.map((id) => ({ path: fontPath(id), modified: 1, dirty: 1 as const })),
    ];
    await db.tracked.bulkPut(rows);
  });
}

/** A change from another device (already decrypted). */
export interface IncomingChange {
  path: string;
  modified: number;
  deleted: boolean;
  /** The content (as `readPath` gives it); ignored for a deletion. */
  value: unknown;
  remote: string;
}

/** What applying changes touched: to reload what is shown. */
export interface AppliedChanges {
  /** Pages (and the desk) whose row or elements changed. */
  pages: Set<string>;
  /** Images or fonts came. */
  assets: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Applies changes from the other devices, without noting them as changes to push. The
 * most recent change of each path wins: older ones (and this device's own, coming back)
 * are skipped.
 */
export async function applyIncoming(
  db: DiaryoDB,
  changes: IncomingChange[],
): Promise<AppliedChanges> {
  const applied: AppliedChanges = { pages: new Set(), assets: false };
  if (changes.length === 0) return applied;
  await db.transaction('rw', [db.pages, db.elements, db.assets, db.fonts, db.tracked], async () => {
    const known = await db.tracked.bulkGet(changes.map((c) => c.path));
    let used: Set<string> | undefined;
    // Images that went are applied last: the elements that showed them may go in this
    // same batch.
    const order = changes
      .map((change, i) => ({ change, i }))
      .sort(
        (x, y) =>
          Number(x.change.deleted && x.change.path.startsWith('asset/')) -
          Number(y.change.deleted && y.change.path.startsWith('asset/')),
      );
    for (const { change, i } of order) {
      const local = known[i];
      if (local && local.modified >= change.modified) {
        // Ours is newer (or the same): only its record is remembered.
        if (!local.remote) await db.tracked.put({ ...local, remote: change.remote });
        continue;
      }
      const target = parsePath(change.path);
      if (!target) continue;
      const value = change.deleted ? null : change.value;
      if (target.kind === 'page') {
        if (!value) await db.pages.delete(target.id);
        else if (isRecord(value)) {
          const here = await db.pages.get(target.id);
          await db.pages.put({
            ...(value as unknown as SharedPage),
            id: target.id,
            camera: here?.camera ?? null,
            thumbnail: here?.thumbnail ?? null,
            thumbnailSpread: false,
          });
        }
        applied.pages.add(target.id);
      } else if (target.kind === 'el') {
        const key: [string, string] = [target.pageId!, target.id];
        if (!value) await db.elements.delete(key);
        else if (isRecord(value)) {
          await db.elements.put({
            pageId: key[0],
            id: key[1],
            data: value as unknown as SceneElement,
          });
        }
        applied.pages.add(key[0]);
      } else if (target.kind === 'asset') {
        if (!value) {
          // Cleaned up on another device, but something here still shows it: it stays
          // and goes up again.
          used ??= await usedAssets(db);
          if (used.has(target.id)) {
            await db.tracked.put({
              path: change.path,
              modified: change.modified + 1,
              dirty: 1,
              remote: change.remote,
            });
            continue;
          }
          await db.assets.delete(target.id);
        } else if (isRecord(value))
          await db.assets.put({ ...(value as unknown as AssetRow), id: target.id });
        applied.assets = true;
      } else {
        if (!value) await db.fonts.delete(target.id);
        else if (isRecord(value))
          await db.fonts.put({ ...(value as unknown as FontRow), id: target.id });
        applied.assets = true;
      }
      await db.tracked.put({
        path: change.path,
        modified: change.modified,
        dirty: 0,
        remote: change.remote,
      });
    }
    // Their thumbnails are drawn again here.
    for (const id of applied.pages) {
      const page = await db.pages.get(id);
      if (page?.thumbnailSpread) await db.pages.put({ ...page, thumbnailSpread: false });
    }
  });
  return applied;
}

/** Whether there is anything in the diary (pages or something on the desk). */
export async function hasContent(db: DiaryoDB): Promise<boolean> {
  return (await db.elements.count()) > 0 || (await db.pages.count()) > 1;
}

/** Images waiting to go up that are bigger than `length` (as data URLs). */
export async function largePendingAssets(db: DiaryoDB, length: number): Promise<AssetRow[]> {
  const rows = await db.tracked
    .where('dirty')
    .equals(1)
    .filter((row) => row.path.startsWith('asset/'))
    .toArray();
  const assets = await db.assets.bulkGet(rows.map((row) => parsePath(row.path)!.id));
  return assets.filter((asset): asset is AssetRow => !!asset && asset.src.length > length);
}

/** Saves a smaller version of an image (same id: the elements that show it don't change). */
export async function replaceAssetSrc(db: DiaryoDB, id: string, src: string) {
  await db.transaction('rw', [db.assets, db.tracked], async () => {
    await db.assets.put({ id, src });
    await touch(db, [assetPath(id)]);
  });
}

/** The images some element shows. */
async function usedAssets(db: DiaryoDB): Promise<Set<string>> {
  const used = new Set<string>();
  await db.elements.each((row) => {
    if (row.data?.type === 'image') used.add(row.data.assetId);
  });
  return used;
}
