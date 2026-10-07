import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteElement } from '../engine/elements';
import {
  countPrivateNotes,
  DESK_ID,
  DESK_INFO,
  DiaryoDB,
  dumpDiary,
  listTexts,
  loadPage,
  releasePrivateNotes,
  replaceDiary,
  rewriteDiary,
  saveChanges,
  updatePage,
  type PageInfo,
} from './db';
import { parseBackup, serializeDiary } from './files';
import { elementPath, readPath } from './tracking';
import { LockedError, newSealingKey, rowIsSealed } from './sealing';

const info: PageInfo = { id: 'p1', date: '2026-10-07', order: 1, title: '' };

const note = (id: string, text: string): NoteElement => ({
  id,
  type: 'note',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  width: 220,
  height: 220,
  text,
  fontSize: 20,
  variant: 'plain',
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
});

let db: DiaryoDB;
let count = 0;
afterEach(async () => {
  db.close();
  await db.delete();
});

function fresh() {
  db = new DiaryoDB(`sealing-${++count}`);
  return db;
}

/** The rows as IndexedDB keeps them, without going through the sealing. */
function raw(table: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(db.name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const idb = request.result;
      const all = idb.transaction(table).objectStore(table).getAll();
      all.onsuccess = () => {
        idb.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
  });
}

/** Whether a text appears anywhere in the rows of a table, as stored. */
async function storedText(table: string, text: string) {
  const rows = await raw(table);
  const decoded = rows.map((row) =>
    JSON.stringify(row, (_, value) =>
      value instanceof Uint8Array ? new TextDecoder().decode(value) : value,
    ),
  );
  return decoded.some((row) => row.includes(text));
}

function seal(target: DiaryoDB) {
  target.sealing.key = newSealingKey();
  target.sealing.seal = true;
  return target.sealing.key;
}

describe('the diary encrypted on the device', () => {
  it('stores nothing readable and reads it back the same', async () => {
    fresh();
    seal(db);
    await saveChanges(db, info, {
      upserts: [note('n1', 'my bank pin is 4321')],
      deletes: [],
      assets: [{ id: 'a1', src: 'data:image/png;base64,SECRETIMAGE' }],
      fonts: [{ id: 'f1', name: 'Secret Font', src: 'data:font/woff2;base64,AAAA' }],
    });
    await updatePage(db, info, {
      title: 'Private title',
      thumbnail: 'data:image/png;base64,THUMB',
    });

    for (const [table, text] of [
      ['elements', '4321'],
      ['assets', 'SECRETIMAGE'],
      ['fonts', 'Secret Font'],
      ['pages', 'Private title'],
      ['pages', 'THUMB'],
    ]) {
      expect(await storedText(table, text), `${table} ${text}`).toBe(false);
    }
    // What IndexedDB indexes stays in the clear.
    const [page] = await raw('pages');
    expect(page).toMatchObject({ id: 'p1', date: '2026-10-07' });
    expect(rowIsSealed(page)).toBe(true);

    const loaded = await loadPage(db, 'p1');
    expect(loaded.elements).toMatchObject([note('n1', 'my bank pin is 4321')]);
    expect((await db.pages.get('p1'))?.title).toBe('Private title');
    expect(await listTexts(db)).toEqual([
      { pageId: 'p1', elementId: 'n1', type: 'note', text: 'my bank pin is 4321' },
    ]);
  });

  it("can't read or write while locked, nor with another key", async () => {
    fresh();
    seal(db);
    await saveChanges(db, DESK_INFO, {
      upserts: [note('n1', 'x')],
      deletes: [],
      assets: [],
      fonts: [],
    });

    db.sealing.key = null;
    await expect(loadPage(db, DESK_INFO.id)).rejects.toBeInstanceOf(LockedError);
    await expect(
      saveChanges(db, DESK_INFO, {
        upserts: [note('n2', 'y')],
        deletes: [],
        assets: [],
        fonts: [],
      }),
    ).rejects.toBeInstanceOf(LockedError);

    db.sealing.key = newSealingKey();
    await expect(loadPage(db, DESK_INFO.id)).rejects.toThrow();
  });

  it("doesn't open a sealed row moved to another place", async () => {
    fresh();
    seal(db);
    await saveChanges(db, info, { upserts: [note('n1', 'x')], deletes: [], assets: [], fonts: [] });
    const [row] = await raw('elements');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(db.name);
      request.onsuccess = () => {
        const tx = request.result.transaction('elements', 'readwrite');
        tx.objectStore('elements').put({ ...row, id: 'n2' });
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(db.elements.get(['p1', 'n2'])).rejects.toThrow();
  });

  it('encrypts and decrypts a diary that exists, also after a cut', async () => {
    fresh();
    const notes = Array.from({ length: 250 }, (_, i) => note(`n${i}`, `text ${i}`));
    await saveChanges(db, info, { upserts: notes, deletes: [], assets: [], fonts: [] });
    expect((await raw('elements')).some(rowIsSealed)).toBe(false);

    seal(db);
    // Cut after the first batch: the rest is still in the clear, and both are read.
    let cut = false;
    await rewriteDiary(db, (done) => {
      if (done >= 100 && !cut) {
        cut = true;
        throw new Error('closed');
      }
    }).catch(() => undefined);
    const halfway = await raw('elements');
    expect(halfway.filter(rowIsSealed).length).toBeGreaterThan(0);
    expect(halfway.some((row) => !rowIsSealed(row))).toBe(true);
    expect((await loadPage(db, 'p1')).elements).toHaveLength(250);

    const tracked = await db.tracked.toArray();
    const progress: number[] = [];
    await rewriteDiary(db, (done, total) => progress.push(done / total));
    expect(progress.at(-1)).toBe(1);
    expect((await raw('elements')).every(rowIsSealed)).toBe(true);
    expect((await raw('pages')).every(rowIsSealed)).toBe(true);
    // Rewriting isn't a change for the other devices.
    expect(await db.tracked.toArray()).toEqual(tracked);

    db.sealing.seal = false;
    await rewriteDiary(db);
    expect((await raw('elements')).some(rowIsSealed)).toBe(false);
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect((await loadPage(db, 'p1')).elements.sort(byId)).toMatchObject(notes.sort(byId));
  });
});

describe('private notes', () => {
  const secretNote = () => ({ ...note('p', 'clave del banco: 1234'), private: true, link: 'p9' });

  it('keep their text apart, readable only with the private key', async () => {
    fresh();
    const key = newSealingKey();
    db.sealing.privateKey = key;
    await saveChanges(db, DESK_INFO, {
      upserts: [secretNote(), note('n', 'a la vista')],
      deletes: [],
      assets: [],
      fonts: [],
    });
    expect(await storedText('elements', '1234')).toBe(false);
    expect(await storedText('elements', 'a la vista')).toBe(true);
    expect((await loadPage(db, DESK_ID)).elements.find((el) => el.id === 'p')).toMatchObject({
      text: 'clave del banco: 1234',
      link: 'p9',
      private: true,
    });

    // Hidden: the same note, without its text, and out of search.
    db.sealing.privateKey = null;
    const hidden = (await loadPage(db, DESK_ID)).elements.find((el) => el.id === 'p');
    expect(hidden).toMatchObject({ text: '', link: null, private: true, concealed: true });
    expect((await listTexts(db)).map((entry) => entry.text)).toEqual(['a la vista']);

    // Moved while hidden: its text stays.
    await saveChanges(db, DESK_INFO, {
      upserts: [{ ...hidden!, x: 500 }],
      deletes: [],
      assets: [],
      fonts: [],
    });
    db.sealing.privateKey = key;
    expect((await loadPage(db, DESK_ID)).elements.find((el) => el.id === 'p')).toMatchObject({
      x: 500,
      text: 'clave del banco: 1234',
    });
    // Another key doesn't open it.
    db.sealing.privateKey = newSealingKey();
    expect((await loadPage(db, DESK_ID)).elements.find((el) => el.id === 'p')).toMatchObject({
      concealed: true,
    });
  });

  it("can't be written shown without the key", async () => {
    fresh();
    await expect(
      saveChanges(db, DESK_INFO, { upserts: [secretNote()], deletes: [], assets: [], fonts: [] }),
    ).rejects.toBeInstanceOf(LockedError);
  });

  it('travel and go into backups with their text encrypted, even while shown', async () => {
    fresh();
    db.sealing.privateKey = newSealingKey();
    await saveChanges(db, DESK_INFO, {
      upserts: [secretNote()],
      deletes: [],
      assets: [],
      fonts: [],
    });
    const travelled = await readPath(db, elementPath(DESK_ID, 'p'));
    expect(JSON.stringify(travelled)).not.toContain('1234');
    expect(travelled).toMatchObject({ concealed: true, private: true });
    const backup = serializeDiary(await dumpDiary(db));
    expect(backup).not.toContain('1234');

    // Opened in another diary with the same key, it reads.
    const key = db.sealing.privateKey;
    db.close();
    await db.delete();
    fresh();
    db.sealing.privateKey = key;
    const parsed = parseBackup(backup);
    if (parsed?.kind !== 'diary') throw new Error('not a diary');
    await replaceDiary(db, parsed.diary);
    expect((await loadPage(db, DESK_ID)).elements[0]).toMatchObject({
      text: 'clave del banco: 1234',
    });
  });

  it('stop being private (shown) or go, and the other devices follow', async () => {
    fresh();
    db.sealing.privateKey = newSealingKey();
    await saveChanges(db, DESK_INFO, {
      upserts: [secretNote(), { ...secretNote(), id: 'q' }],
      deletes: [],
      assets: [],
      fonts: [],
    });
    expect(await countPrivateNotes(db)).toBe(2);
    const key = db.sealing.privateKey;
    db.sealing.privateKey = null;
    await expect(releasePrivateNotes(db, 'open')).rejects.toBeInstanceOf(LockedError);
    db.sealing.privateKey = key;
    await db.tracked.clear();
    expect(await releasePrivateNotes(db, 'open')).toBe(2);
    expect(await storedText('elements', '1234')).toBe(true);
    expect(await countPrivateNotes(db)).toBe(0);
    expect(await db.tracked.count()).toBe(2);
  });
});
