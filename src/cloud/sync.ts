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
import { decrypt, encrypt, itemName, type DiaryKeys } from './crypto';

/**
 * The cloud sync (docs/cloud.md): pushes what changed here and pulls what changed on the
 * other devices. Each tracked path is one item on the server, encrypted, under an opaque
 * key; the server only knows its kind, its time and whether it is a tombstone.
 */

/** An item as the server keeps it. */
export interface RemoteItem {
  id: string;
  key: string;
  kind: ItemKind;
  /** The encrypted content (empty for a tombstone). */
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
}

/** The server has a newer version of the item. */
export class StaleError extends Error {}
/** The account's space is full. */
export class QuotaError extends Error {}
/** Another device created that item first. */
export class DuplicateError extends Error {}
/** The item isn't on the server (any more). */
export class MissingError extends Error {}

const PULL_PAGE = 200;
const PUSH_AT_ONCE = 4;

/** Pages first (so the others list them), then images and fonts, then elements. */
const ORDER: Record<string, number> = { page: 0, asset: 1, font: 2, el: 3 };

const kindOf = (path: string): ItemKind => {
  const kind = parsePath(path)?.kind;
  return kind === 'page' ? 'page' : kind === 'el' ? 'element' : 'asset';
};

interface Sealed {
  path: string;
  value: unknown;
}

export interface PushResult {
  pushed: number;
  /** The space ran out: what is left stays pending. */
  full: boolean;
}

export class Sync {
  private readonly names = new Map<string, Promise<string>>();

  constructor(
    private readonly db: DiaryoDB,
    private readonly remote: Remote,
    private readonly keys: DiaryKeys,
    /** Applies pulled changes (the diary wraps it to show them). */
    private readonly apply: (changes: IncomingChange[]) => Promise<AppliedChanges> = (changes) =>
      applyIncoming(db, changes),
  ) {}

  /** The opaque key of a path (the same on every device). */
  private name(path: string) {
    let name = this.names.get(path);
    if (!name) this.names.set(path, (name = itemName(this.keys.mac, path)));
    return name;
  }

  private async draft(row: TrackedRow): Promise<ItemDraft> {
    const value = await readPath(this.db, row.path);
    const deleted = value === null;
    const sealed: Sealed = { path: row.path, value };
    return {
      key: await this.name(row.path),
      kind: kindOf(row.path),
      data: deleted
        ? ''
        : await encrypt(this.keys.enc, new TextEncoder().encode(JSON.stringify(sealed))),
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
    const pending = (await dirtyPaths(this.db)).sort(
      (a, b) => (ORDER[a.path.split('/')[0]] ?? 9) - (ORDER[b.path.split('/')[0]] ?? 9),
    );
    let done = 0;
    let full = false;
    onProgress?.(0, pending.length);
    const next = pending.values();
    const worker = async () => {
      for (const row of next) {
        if (full) return;
        try {
          const draft = await this.draft(row);
          const written = await this.write(row, draft);
          if (written) await markPushed(this.db, row.path, row.modified, written.id);
          else await this.db.tracked.delete(row.path);
        } catch (error) {
          if (error instanceof StaleError) await markStale(this.db, row.path, row.modified);
          else if (error instanceof QuotaError) {
            full = true;
            return;
          } else throw error;
        }
        done++;
        onProgress?.(done, pending.length);
      }
    };
    await Promise.all(Array.from({ length: PUSH_AT_ONCE }, worker));
    return { pushed: done, full };
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
    return { cursor, applied };
  }

  /** Decrypts an item. A tombstone tells its path by its key (known if it was here). */
  private async open(item: RemoteItem): Promise<IncomingChange | null> {
    const base = { modified: item.modified, deleted: item.deleted, remote: item.id };
    if (item.deleted) {
      const row = await this.db.tracked.where('remote').equals(item.id).first();
      const path = row?.path ?? (await this.pathOfKey(item.key));
      return path ? { ...base, path, value: null } : null;
    }
    try {
      const plain = await decrypt(this.keys.enc, item.data);
      const sealed = JSON.parse(new TextDecoder().decode(plain)) as Sealed;
      if (typeof sealed.path !== 'string' || (await this.name(sealed.path)) !== item.key)
        return null;
      return { ...base, path: sealed.path, value: sealed.value };
    } catch (error) {
      console.error("Couldn't open an item from the cloud", item.id, error);
      return null;
    }
  }

  /** The path of an opaque key, if this device has (or had) it. */
  private async pathOfKey(key: string): Promise<string | null> {
    const rows = await this.db.tracked.toArray();
    for (const row of rows) if ((await this.name(row.path)) === key) return row.path;
    return null;
  }
}
