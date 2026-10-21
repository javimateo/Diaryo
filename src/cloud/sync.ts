import type { DiaryoDB } from '../storage/db';
import {
  applyIncoming,
  dirtyPaths,
  markPushed,
  markStale,
  parsePath,
  readPath,
  type AppliedChanges,
  type IncomingChange,
  type TrackedRow,
} from '../storage/tracking';
import { decrypt, encrypt, fromBase64, itemName, toBase64, type DiaryKeys } from './crypto';

/**
 * The cloud sync (docs/cloud.md): pushes what changed here and pulls what changed on the
 * other devices. Each tracked path is one item on the server, encrypted, under an opaque
 * key; the server only knows its kind, its time and whether it is a tombstone. The time
 * and the deletion are sealed inside too, so the server can't change them.
 */

/** An item as the server keeps it. */
export interface RemoteItem {
  id: string;
  key: string;
  kind: ItemKind;
  /** The encrypted content (a tombstone's only says it was deleted). */
  data: string;
  modified: number;
  deleted: boolean;
  /** The server's time of its last write: pulling goes by it. */
  updated: string;
}

export type ItemKind = 'page' | 'element' | 'asset';
export type ItemDraft = Pick<RemoteItem, 'key' | 'kind' | 'data' | 'modified' | 'deleted'>;

/** Where the pull got to: the last item seen (by time, then id). */
export interface PullCursor {
  updated: string;
  id: string;
}

export const START: PullCursor = { updated: '', id: '' };

/** The server, as the sync needs it (PocketBase in the app, a fake one in the tests). */
export interface Remote {
  /** Items written after the cursor, oldest first. */
  listAfter(cursor: PullCursor, limit: number): Promise<RemoteItem[]>;
  create(draft: ItemDraft): Promise<RemoteItem>;
  update(id: string, draft: ItemDraft): Promise<RemoteItem>;
  findByKey(key: string): Promise<RemoteItem | null>;
  /**
   * Where the next pull starts, from where this one ended: a little earlier, because a
   * write that started before the last one seen may be saved after it (with an earlier
   * time). Reading them again is harmless: the same change twice changes nothing.
   */
  rewind?(cursor: PullCursor): PullCursor;
}

/** The server has a newer version of the item. */
export class StaleError extends Error {}
/** The account's space is full. */
export class QuotaError extends Error {}
/** Another device created that item first. */
export class DuplicateError extends Error {}
/** The item isn't on the server (any more). */
export class MissingError extends Error {}
/** The server refused this item (too big, or not valid): it stays pending, the rest go on. */
export class RejectedError extends Error {}

/**
 * Since when every device seals each item's time and deletion (the web app with it went up
 * at 08:56 UTC; the desktop app had no cloud yet). An item without them is only believed
 * from before then: one with a later time is an old version passed off as new.
 */
export const SEALED_SINCE = Date.UTC(2026, 9, 7, 9, 30);

const PULL_PAGE = 200;
const PUSH_AT_ONCE = 6;

/** Pages first (so the others list them), then images and fonts, then elements. */
const ORDER: Record<string, number> = { page: 0, asset: 1, font: 2, el: 3 };

const kindOf = (path: string): ItemKind => {
  const kind = parsePath(path)?.kind;
  return kind === 'page' ? 'page' : kind === 'el' ? 'element' : 'asset';
};

interface Sealed {
  path: string;
  value: unknown;
  /**
   * The item's time and whether it was deleted, as the device wrote them (items from
   * before they were sealed don't have them).
   */
  modified?: number;
  deleted?: boolean;
}

/**
 * What goes inside the encryption. Usually JSON; a file (an image or a font, kept as a
 * base 64 data URL) goes as its raw bytes after a small JSON header, so it isn't base 64
 * twice: `1`, the header's length (4 bytes), the header, the bytes.
 */
const FILE_FORMAT = 1;
const DATA_URL = /^data:([^;,]+);base64,/;

export function seal(sealed: Sealed): Uint8Array<ArrayBuffer> {
  const value = sealed.value as { src?: unknown } | null;
  const match = typeof value?.src === 'string' ? DATA_URL.exec(value.src) : null;
  if (!value || !match) return new TextEncoder().encode(JSON.stringify(sealed));
  const src = value.src as string;
  const bytes = fromBase64(src.slice(match[0].length));
  const header = new TextEncoder().encode(
    JSON.stringify({ ...sealed, value: { ...value, src: undefined }, mime: match[1] }),
  );
  const out = new Uint8Array(5 + header.length + bytes.length);
  out[0] = FILE_FORMAT;
  new DataView(out.buffer).setUint32(1, header.length);
  out.set(header, 5);
  out.set(bytes, 5 + header.length);
  return out;
}

export function unseal(plain: Uint8Array): Sealed {
  if (plain[0] !== FILE_FORMAT) return JSON.parse(new TextDecoder().decode(plain)) as Sealed;
  const length = new DataView(plain.buffer, plain.byteOffset).getUint32(1);
  const { mime, ...header } = JSON.parse(
    new TextDecoder().decode(plain.subarray(5, 5 + length)),
  ) as Sealed & { mime: string };
  const src = `data:${mime};base64,${toBase64(plain.subarray(5 + length))}`;
  return { ...header, value: { ...(header.value as object), src } };
}

export interface PushResult {
  pushed: number;
  /** The space ran out: what is left stays pending. */
  full: boolean;
  /** Items the server refused (they stay pending). */
  rejected: number;
}

/** Each path's opaque key, per naming key (computing them takes time; they never change). */
const nameCache = new WeakMap<CryptoKey, Map<string, Promise<string>>>();

export class Sync {
  private readonly names: Map<string, Promise<string>>;

  constructor(
    private readonly db: DiaryoDB,
    private readonly remote: Remote,
    private readonly keys: DiaryKeys,
    /** Applies pulled changes (the diary wraps it to show them). */
    private readonly apply: (changes: IncomingChange[]) => Promise<AppliedChanges> = (changes) =>
      applyIncoming(db, changes),
  ) {
    let names = nameCache.get(keys.mac);
    if (!names) nameCache.set(keys.mac, (names = new Map()));
    this.names = names;
  }

  /** The opaque key of a path (the same on every device). */
  private name(path: string) {
    let name = this.names.get(path);
    if (!name) this.names.set(path, (name = itemName(this.keys.mac, path)));
    return name;
  }

  private async draft(row: TrackedRow): Promise<ItemDraft> {
    const value = await readPath(this.db, row.path);
    const deleted = value === null;
    const sealed: Sealed = { path: row.path, value, modified: row.modified, deleted };
    return {
      key: await this.name(row.path),
      kind: kindOf(row.path),
      data: await encrypt(this.keys.enc, seal(sealed)),
      modified: row.modified,
      deleted,
    };
  }

  /** Writes one item; returns its record, or null if it doesn't need to go up. */
  private async write(row: TrackedRow, draft: ItemDraft): Promise<RemoteItem | null> {
    if (row.remote) {
      try {
        return await this.remote.update(row.remote, draft);
      } catch (error) {
        if (!(error instanceof MissingError)) throw error;
      }
    }
    // A deletion of something never pushed only matters if it is up there anyway.
    if (draft.deleted && !row.remote) {
      const there = await this.remote.findByKey(draft.key);
      return there ? this.remote.update(there.id, draft) : null;
    }
    try {
      return await this.remote.create(draft);
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      const there = await this.remote.findByKey(draft.key);
      if (!there) throw error;
      return this.remote.update(there.id, draft);
    }
  }

  /** Pushes everything pending. `onProgress` says how it goes. */
  async push(onProgress?: (done: number, total: number) => void): Promise<PushResult> {
    const dirty = await dirtyPaths(this.db);
    // Images that went go up last: after the elements that stopped showing them, so no
    // device hears of the image going while it still shows it.
    const assetIds = dirty
      .filter((row) => row.path.startsWith('asset/'))
      .map((row) => row.path.slice(6));
    const present = await this.db.assets.bulkGet(assetIds);
    const gone = new Set(assetIds.filter((_, i) => !present[i]).map((id) => `asset/${id}`));
    const rank = (path: string) => (gone.has(path) ? 9 : (ORDER[path.split('/')[0]] ?? 8));
    const pending = dirty.sort((a, b) => rank(a.path) - rank(b.path));
    let done = 0;
    let full = false;
    let rejected = 0;
    onProgress?.(0, pending.length);
    const next = pending.values();
    const worker = async () => {
      for (const row of next) {
        if (full) return;
        try {
          const draft = await this.draft(row);
          const written = await this.write(row, draft);
          if (written) await markPushed(this.db, row.path, row.modified, written);
          else await this.db.tracked.delete(row.path);
        } catch (error) {
          if (error instanceof StaleError) await markStale(this.db, row.path, row.modified);
          else if (error instanceof QuotaError) {
            full = true;
            return;
          } else if (error instanceof RejectedError) {
            console.error('The server refused an item; it stays pending', row.path, error);
            rejected++;
          } else throw error;
        }
        done++;
        onProgress?.(done, pending.length);
      }
    };
    await Promise.all(Array.from({ length: PUSH_AT_ONCE }, worker));
    return { pushed: done, full, rejected };
  }

  /**
   * Pulls what changed on the server after the cursor and applies it. Returns where it got
   * to and what changed here.
   */
  async pull(cursor: PullCursor): Promise<{ cursor: PullCursor; applied: AppliedChanges }> {
    const applied: AppliedChanges = { pages: new Set(), assets: false };
    for (;;) {
      const items = await this.remote.listAfter(cursor, PULL_PAGE);
      if (items.length === 0) break;
      const changes: IncomingChange[] = [];
      for (const item of items) {
        const change = await this.open(item);
        if (change) changes.push(change);
      }
      const result = await this.apply(changes);
      result.pages.forEach((id) => applied.pages.add(id));
      applied.assets ||= result.assets;
      const last = items[items.length - 1];
      cursor = { updated: last.updated, id: last.id };
      if (items.length < PULL_PAGE) break;
    }
    return { cursor: this.remote.rewind?.(cursor) ?? cursor, applied };
  }

  /**
   * Decrypts an item. Its time and whether it was deleted are only believed as sealed
   * inside, so neither the server nor someone with the session (but not the keys) can
   * delete things or bring an old version back. The server may lower the time (it stamps
   * changes from the future with its own), never raise it.
   */
  private async open(item: RemoteItem): Promise<IncomingChange | null> {
    // Tombstones from before they were sealed carry nothing to check: ignored.
    if (!item.data) return null;
    let sealed: Sealed;
    try {
      sealed = unseal(await decrypt(this.keys.enc, item.data));
    } catch (error) {
      console.error("Couldn't open an item from the cloud", item.id, error);
      return null;
    }
    if (typeof sealed.path !== 'string' || (await this.name(sealed.path)) !== item.key) return null;
    // Items from before the time was sealed can only be content, from before then.
    const unsealed = typeof sealed.modified !== 'number';
    const believed = unsealed
      ? !item.deleted && item.modified < SEALED_SINCE
      : sealed.deleted === item.deleted && item.modified <= sealed.modified!;
    if (!believed) {
      console.error('An item from the cloud was changed outside diaryo', item.id);
      return null;
    }
    return {
      path: sealed.path,
      value: item.deleted ? null : sealed.value,
      modified: item.modified,
      deleted: item.deleted,
      remote: item.id,
    };
  }
}
