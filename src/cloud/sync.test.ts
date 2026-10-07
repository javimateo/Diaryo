import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ImageElement, StrokeElement, TextElement } from '../engine/elements';
import {
  deletePage,
  DiaryoDB,
  cleanUpDiary,
  dropUnusedAssets,
  dumpDiary,
  listPages,
  replaceDiary,
  saveChanges,
  updatePage,
  type PageInfo,
} from '../storage/db';
import { dirtyPaths, trackEverything } from '../storage/tracking';
import { createVault, itemName, type DiaryKeys } from './crypto';
import {
  DuplicateError,
  MissingError,
  QuotaError,
  RejectedError,
  StaleError,
  START,
  seal,
  Sync,
  unseal,
  type ItemDraft,
  type PullCursor,
  type Remote,
  type RemoteItem,
} from './sync';

/**
 * A server that behaves like ours (pb_hooks/items.js): newest wins, no times from the
 * future, small tombstones, quota, unique keys.
 */
class FakeServer {
  items: RemoteItem[] = [];
  quota = Infinity;
  /** Bigger items are refused (as the server's `data` field limit). */
  maxData = Infinity;
  private clock = 0;
  private ids = 0;

  private used(except?: string) {
    return this.items.filter((i) => i.id !== except).reduce((n, i) => n + i.data.length, 0);
  }

  /** A time from the future becomes now; a tombstone carries no content; nothing too big. */
  private check(draft: ItemDraft): ItemDraft {
    if (draft.data.length > (draft.deleted ? 1000 : this.maxData)) throw new RejectedError();
    const now = Date.now();
    return draft.modified > now + 60_000 ? { ...draft, modified: now } : draft;
  }

  private stamp() {
    return String(++this.clock).padStart(12, '0');
  }

  remote(): Remote {
    return {
      listAfter: async (cursor: PullCursor, limit: number) =>
        this.items
          .filter(
            (i) => i.updated > cursor.updated || (i.updated === cursor.updated && i.id > cursor.id),
          )
          .sort((a, b) => a.updated.localeCompare(b.updated) || a.id.localeCompare(b.id))
          .slice(0, limit)
          .map((i) => ({ ...i })),
      create: async (draft: ItemDraft) => {
        if (this.items.some((i) => i.key === draft.key)) throw new DuplicateError();
        draft = this.check(draft);
        if (this.used() + draft.data.length > this.quota) throw new QuotaError();
        const item = {
          ...draft,
          id: `r${String(++this.ids).padStart(6, '0')}`,
          updated: this.stamp(),
        };
        this.items.push(item);
        return { ...item };
      },
      update: async (id: string, draft: ItemDraft) => {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new MissingError();
        draft = this.check(draft);
        if (draft.modified < item.modified) throw new StaleError();
        const { data } = draft;
        const growing = !draft.deleted && data.length > item.data.length;
        if (growing && this.used(id) + data.length > this.quota) throw new QuotaError();
        Object.assign(item, { ...draft, updated: this.stamp() });
        return { ...item };
      },
      // As the real one: the next pull reads the last few writes again.
      rewind: (cursor: PullCursor) =>
        cursor.updated
          ? { updated: String(Math.max(0, Number(cursor.updated) - 5)).padStart(12, '0'), id: '' }
          : cursor,
      findByKey: async (key: string) => {
        const item = this.items.find((i) => i.key === key);
        return item ? { ...item } : null;
      },
    };
  }
}

/** One device: its database, its sync and where its pull got to. */
class Device {
  readonly db: DiaryoDB;
  readonly sync: Sync;
  cursor: PullCursor = START;

  constructor(name: string, server: FakeServer, keys: DiaryKeys) {
    this.db = new DiaryoDB(`${name}-${Math.random()}`);
    this.sync = new Sync(this.db, server.remote(), keys);
  }

  push() {
    return this.sync.push();
  }

  async pull() {
    const result = await this.sync.pull(this.cursor);
    this.cursor = result.cursor;
    return result.applied;
  }

  async both() {
    await this.push();
    return this.pull();
  }

  elements(pageId: string) {
    return this.db.elements.where('pageId').equals(pageId).toArray();
  }
}

const info = (id: string): PageInfo => ({ id, date: '2026-10-02', order: 1, title: '' });

const stroke = (id: string, x = 0): StrokeElement =>
  ({
    id,
    type: 'stroke',
    kind: 'pen',
    z: 1,
    points: [x, 0, 0.5, x + 10, 10, 0.5],
    color: '#000000',
    size: 2,
    opacity: 1,
    angle: 0,
  }) as unknown as StrokeElement;

const text = (id: string, value: string): TextElement =>
  ({
    id,
    type: 'text',
    z: 2,
    x: 0,
    y: 0,
    width: 100,
    text: value,
    color: '#000000',
    fontSize: 16,
    font: 'sans',
    align: 'left',
    angle: 0,
  }) as unknown as TextElement;

const save = (
  db: DiaryoDB,
  page: string,
  upserts: (StrokeElement | TextElement | ImageElement)[],
  deletes: string[] = [],
) => saveChanges(db, info(page), { upserts, deletes, assets: [], fonts: [] });

let keys: DiaryKeys;
beforeAll(async () => {
  keys = (await createVault('clave', 1000)).keys;
});

const setUp = () => {
  const server = new FakeServer();
  return { server, a: new Device('a', server, keys), b: new Device('b', server, keys) };
};

describe('sync', () => {
  it('takes a page and its elements to the other device', async () => {
    const { a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1'), stroke('s2', 50)]);
    await updatePage(a.db, info('p1'), { title: 'Viaje' });
    const pushed = await a.push();
    expect(pushed.pushed).toBe(3);
    expect(await dirtyPaths(a.db)).toEqual([]);

    const applied = await b.pull();
    expect([...applied.pages]).toEqual(['p1']);
    expect((await b.elements('p1')).map((r) => r.id).sort()).toEqual(['s1', 's2']);
    expect((await listPages(b.db))[0].title).toBe('Viaje');
  });

  it('keeps everything encrypted and opaque on the server', async () => {
    const { server, a } = setUp();
    await save(a.db, 'page-name-here', [text('element-name-here', 'mi secreto')]);
    await a.push();
    const all = JSON.stringify(server.items);
    expect(all).not.toContain('mi secreto');
    expect(all).not.toContain('page-name-here');
    expect(all).not.toContain('element-name-here');
  });

  it("doesn't share the view nor the thumbnail", async () => {
    const { a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1')]);
    await saveChanges(a.db, info('p1'), {
      upserts: [],
      deletes: [],
      assets: [],
      fonts: [],
      camera: { x: 5, y: 5, zoom: 2 },
    });
    await updatePage(a.db, info('p1'), { thumbnail: 'data:image/png;base64,AAAA' });
    await a.push();
    await b.pull();
    const page = (await listPages(b.db))[0];
    expect(page.camera).toBeNull();
    expect(page.thumbnail).toBeNull();
    // Only moving the view leaves nothing to push.
    await a.push();
    await saveChanges(a.db, info('p1'), {
      upserts: [],
      deletes: [],
      assets: [],
      fonts: [],
      camera: { x: 9, y: 9, zoom: 1 },
    });
    expect(await dirtyPaths(a.db)).toEqual([]);
  });

  it('takes deletions across, and what was deleted does not come back', async () => {
    const { a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1'), stroke('s2')]);
    await a.both();
    await b.pull();

    await save(a.db, 'p1', [], ['s1']);
    await a.both();
    await b.both();
    expect((await b.elements('p1')).map((r) => r.id)).toEqual(['s2']);
    await a.pull();
    expect((await a.elements('p1')).map((r) => r.id)).toEqual(['s2']);

    // A whole page.
    await deletePage(b.db, 'p1');
    await b.both();
    await a.both();
    expect(await listPages(a.db)).toEqual([]);
    expect(await a.elements('p1')).toEqual([]);
  });

  it('keeps the most recent change of an element edited on both', async () => {
    const { a, b } = setUp();
    await save(a.db, 'p1', [text('t1', 'antes')]);
    await a.both();
    await b.pull();

    await save(a.db, 'p1', [text('t1', 'en A')]);
    await new Promise((r) => setTimeout(r, 5));
    await save(b.db, 'p1', [text('t1', 'en B, después')]);
    // A pushes first; B's later change still wins, in both orders of pulling.
    await a.both();
    await b.both();
    await a.pull();
    for (const device of [a, b]) {
      const [row] = await device.elements('p1');
      expect((row.data as TextElement).text).toBe('en B, después');
    }
  });

  it('keeps both when each device changes a different element of the same page', async () => {
    const { a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1')]);
    await a.both();
    await b.pull();
    await save(a.db, 'p1', [stroke('from-a')]);
    await save(b.db, 'p1', [stroke('from-b')]);
    await a.both();
    await b.both();
    await a.pull();
    for (const device of [a, b]) {
      expect((await device.elements('p1')).map((r) => r.id).sort()).toEqual([
        'from-a',
        'from-b',
        's1',
      ]);
    }
  });

  it('pulls are idempotent: its own changes coming back change nothing', async () => {
    const { a } = setUp();
    await save(a.db, 'p1', [stroke('s1')]);
    await a.push();
    const applied = await a.pull();
    expect(applied.pages.size).toBe(0);
    expect(await dirtyPaths(a.db)).toEqual([]);
  });

  it('stops when the space is full, keeps the rest pending, and goes on with room', async () => {
    const { server, a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1')]);
    await a.push();
    server.quota = server.items.reduce((n, i) => n + i.data.length, 0) + 10;
    await save(a.db, 'p1', [stroke('s2'), stroke('s3')]);
    const result = await a.push();
    expect(result.full).toBe(true);
    expect((await dirtyPaths(a.db)).length).toBeGreaterThan(0);

    // Deleting always goes through.
    await save(a.db, 'p1', [], ['s1']);
    await a.push();
    await b.pull();
    expect((await b.elements('p1')).some((r) => r.id === 's1')).toBe(false);

    server.quota = Infinity;
    expect((await a.push()).full).toBe(false);
    expect(await dirtyPaths(a.db)).toEqual([]);
    await b.pull();
    expect((await b.elements('p1')).map((r) => r.id).sort()).toEqual(['s2', 's3']);
  });

  it('merges two diaries the first time (each one with its own pages)', async () => {
    const { a, b } = setUp();
    await save(a.db, 'from-a', [stroke('s1')]);
    await a.push();
    // B had its own diary before signing in.
    await save(b.db, 'from-b', [stroke('s2')]);
    await trackEverything(b.db);
    await b.pull();
    await b.push();
    await a.pull();
    for (const device of [a, b]) {
      expect((await listPages(device.db)).map((p) => p.id).sort()).toEqual(['from-a', 'from-b']);
    }
  });

  it('finds an item another device created first under the same path', async () => {
    const { a, b } = setUp();
    await save(a.db, 'desk', [stroke('d1', 0)]);
    await save(b.db, 'desk', [stroke('d1', 99)]);
    await a.push();
    // B never pulled: its create collides with A's and becomes an update (B's is newer).
    await b.push();
    await a.pull();
    const [row] = await a.elements('desk');
    expect((row.data as StrokeElement).points[0]).toBe(99);
  });

  it('replacing the diary with a backup deletes what is gone on the other devices too', async () => {
    const { a, b } = setUp();
    await save(a.db, 'old', [stroke('s1')]);
    await a.both();
    await b.pull();
    // A backup with another page instead.
    const other = new DiaryoDB(`backup-${Math.random()}`);
    await save(other, 'new', [stroke('s2')]);
    await replaceDiary(a.db, await dumpDiary(other));
    await a.both();
    await b.pull();
    expect((await listPages(b.db)).map((p) => p.id)).toEqual(['new']);
    expect(await b.elements('old')).toEqual([]);
  });

  it("taking the cloud's diary instead of this one deletes nothing up there", async () => {
    const { server, a, b } = setUp();
    await save(a.db, 'shared', [stroke('s1')]);
    await a.both();
    await save(b.db, 'only-b', [stroke('s2')]);
    // B chooses the cloud's diary: its own is dropped here, not up there.
    await replaceDiary(b.db, { pages: [], assets: [], fonts: [] }, false);
    expect(await dirtyPaths(b.db)).toEqual([]);
    await b.both();
    expect((await listPages(b.db)).map((p) => p.id)).toEqual(['shared']);
    expect(server.items.every((i) => !i.deleted)).toBe(true);
  });

  it('goes on with the rest when the server refuses one item, which stays pending', async () => {
    const { server, a, b } = setUp();
    await save(a.db, 'p1', [stroke('small')]);
    await a.push();
    server.maxData = (server.items.find((i) => i.kind === 'element')?.data.length ?? 0) + 50;
    await save(a.db, 'p1', [text('big', 'x'.repeat(2000)), stroke('also-small', 5)]);
    const result = await a.push();
    expect(result.rejected).toBe(1);
    expect((await dirtyPaths(a.db)).map((r) => r.path)).toEqual(['el/p1/big']);
    await b.pull();
    expect((await b.elements('p1')).map((r) => r.id).sort()).toEqual(['also-small', 'small']);
  });

  describe('images nothing shows any more', () => {
    const image = (id: string, assetId: string) =>
      ({
        id,
        type: 'image',
        z: 1,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        opacity: 1,
        groupId: null,
        locked: false,
        assetId,
      }) as ImageElement;
    const photo = { id: 'a1', src: 'data:image/webp;base64,' + 'A'.repeat(5000) };
    const used = (server: FakeServer) => server.items.reduce((n, i) => n + i.data.length, 0);

    it('free their space here and in the cloud', async () => {
      const { server, a, b } = setUp();
      await saveChanges(a.db, info('p1'), {
        upserts: [image('img', 'a1')],
        deletes: [],
        assets: [photo],
        fonts: [],
      });
      await a.both();
      const before = used(server);
      await b.pull();
      expect(await b.db.assets.count()).toBe(1);

      await save(a.db, 'p1', [], ['img']);
      expect(await dropUnusedAssets(a.db)).toBe(1);
      await a.both();
      expect(used(server)).toBeLessThan(before - 5000);
      await b.pull();
      expect(await b.db.assets.count()).toBe(0);
    });

    it('come back with undo (the element brings its file)', async () => {
      const { a } = setUp();
      await saveChanges(a.db, info('p1'), {
        upserts: [image('img', 'a1')],
        deletes: [],
        assets: [photo],
        fonts: [],
      });
      await save(a.db, 'p1', [], ['img']);
      await dropUnusedAssets(a.db);
      expect(await a.db.assets.count()).toBe(0);
      // Undo: the element is saved again, with the file the engine still has.
      await saveChanges(a.db, info('p1'), {
        upserts: [image('img', 'a1')],
        deletes: [],
        assets: [],
        fonts: [],
        restore: [photo],
      });
      expect((await a.db.assets.get('a1'))?.src).toBe(photo.src);
      expect((await dirtyPaths(a.db)).some((r) => r.path === 'asset/a1')).toBe(true);
    });

    it('stay on a device that still shows them, and go up again', async () => {
      const { server, a, b } = setUp();
      await saveChanges(a.db, info('p1'), {
        upserts: [image('img', 'a1')],
        deletes: [],
        assets: [photo],
        fonts: [],
      });
      await a.both();
      await b.pull();
      // B copies the image to another page before hearing that A deleted it.
      await save(b.db, 'p2', [image('copy', 'a1')]);
      await save(a.db, 'p1', [], ['img']);
      await dropUnusedAssets(a.db);
      await a.both();
      await b.both();
      expect(await b.db.assets.get('a1')).toBeTruthy();
      // It goes up again with B's next push.
      await b.push();
      expect(server.items.find((i) => i.kind === 'asset')?.deleted).toBe(false);
      await a.pull();
      expect(await a.db.assets.get('a1')).toBeTruthy();
    });
  });

  it('keeps files as bytes (not base 64 twice), and still reads the plain JSON ones', () => {
    const src = 'data:image/webp;base64,' + btoa('fake image bytes, quite a few of them');
    const sealed = { path: 'asset/a1', value: { id: 'a1', src } };
    const packed = seal(sealed);
    expect(packed[0]).toBe(1);
    expect(packed.length).toBeLessThan(JSON.stringify(sealed).length);
    expect(unseal(packed)).toEqual(sealed);
    // Elements stay JSON; items saved before this format are read the same way.
    const element = { path: 'el/p/e', value: { id: 'e', type: 'stroke' } };
    expect(unseal(seal(element))).toEqual(element);
    expect(unseal(new TextEncoder().encode(JSON.stringify(sealed)))).toEqual(sealed);
  });

  it("doesn't miss a write the server saved late, with an earlier time", async () => {
    const { server, a, b } = setUp();
    await save(a.db, 'p1', [stroke('s1')]);
    await a.push();
    await b.pull();
    await save(a.db, 'p1', [stroke('s2')]);
    await a.push();
    // s2's write started before the last one B saw, and was saved after B pulled.
    const late = server.items.filter((i) => i.kind === 'element').pop()!;
    late.updated = '000000000001';
    await b.pull();
    expect((await b.elements('p1')).map((r) => r.id).sort()).toEqual(['s1', 's2']);
  });

  describe('a page deleted on one device while another one writes on it', () => {
    it('loses what was written before the deletion (nothing is left hidden)', async () => {
      const { a, b } = setUp();
      await save(a.db, 'p1', [stroke('s1')]);
      await a.both();
      await b.pull();
      // B writes on the page without having heard of the deletion…
      await save(b.db, 'p1', [stroke('from-b')]);
      // …which A did later.
      await new Promise((r) => setTimeout(r, 5));
      await deletePage(a.db, 'p1');
      await a.push();
      await b.push();
      await b.pull();
      await a.pull();
      await cleanUpDiary(a.db);
      await cleanUpDiary(b.db);
      await a.both();
      await b.both();
      for (const device of [a, b]) {
        expect(await listPages(device.db)).toEqual([]);
        expect(await device.elements('p1')).toEqual([]);
      }
    });

    it('brings the page back when the writing is more recent than the deletion', async () => {
      const { a, b } = setUp();
      await save(a.db, 'p1', [stroke('s1')]);
      await a.both();
      await b.pull();
      await deletePage(a.db, 'p1');
      await new Promise((r) => setTimeout(r, 5));
      await save(b.db, 'p1', [stroke('from-b')]);
      await a.push();
      await b.both();
      await a.pull();
      for (const device of [a, b]) {
        await cleanUpDiary(device.db);
        expect((await listPages(device.db)).map((p) => p.id)).toEqual(['p1']);
        expect((await device.elements('p1')).map((r) => r.id)).toEqual(['from-b']);
      }
    });
  });

  describe('what the server (or someone with the session, not the keys) could change', () => {
    const itemOf = async (server: FakeServer, path: string) => {
      const key = await itemName(keys.mac, path);
      return server.items.find((i) => i.key === key)!;
    };

    it('a deletion that is not sealed deletes nothing', async () => {
      const { server, a, b } = setUp();
      await save(a.db, 'p1', [stroke('s1')]);
      await a.push();
      await b.pull();
      const item = await itemOf(server, 'el/p1/s1');
      // Marked deleted, with a later time: without content, or keeping the sealed content.
      Object.assign(item, { deleted: true, data: '', modified: item.modified + 1000 });
      item.updated = '999999999990';
      await b.pull();
      const { data } = await itemOf(server, 'page/p1');
      Object.assign(await itemOf(server, 'page/p1'), {
        deleted: true,
        data,
        updated: '999999999991',
      });
      await b.pull();
      expect((await b.elements('p1')).map((r) => r.id)).toEqual(['s1']);
      expect((await listPages(b.db)).map((p) => p.id)).toEqual(['p1']);
    });

    it('an old version brought back with a newer time is ignored', async () => {
      const { server, a, b } = setUp();
      await save(a.db, 'p1', [text('t1', 'primera')]);
      await a.push();
      const old = (await itemOf(server, 'el/p1/t1')).data;
      await new Promise((r) => setTimeout(r, 5));
      await save(a.db, 'p1', [text('t1', 'segunda')]);
      await a.push();
      await b.pull();
      const item = await itemOf(server, 'el/p1/t1');
      Object.assign(item, { data: old, modified: item.modified + 1000, updated: '999999999990' });
      await b.pull();
      const [row] = await b.elements('p1');
      expect((row.data as TextElement).text).toBe('segunda');
    });

    it('a time from the future is stamped now, and the device keeps the stamped one', async () => {
      const { server, a, b } = setUp();
      await save(a.db, 'p1', [text('t1', 'reloj adelantado')]);
      const ahead = Date.now() + 24 * 60 * 60 * 1000;
      await a.db.tracked.update('el/p1/t1', { modified: ahead });
      await a.push();
      await b.pull();
      const stored = (await itemOf(server, 'el/p1/t1')).modified;
      expect(stored).toBeLessThan(ahead - 60_000);
      expect((await a.db.tracked.get('el/p1/t1'))?.modified).toBe(stored);

      // A later change on the other device wins, here too.
      await new Promise((r) => setTimeout(r, 5));
      await save(b.db, 'p1', [text('t1', 'de b')]);
      await b.push();
      await a.pull();
      const [row] = await a.elements('p1');
      expect((row.data as TextElement).text).toBe('de b');
    });
  });
});
