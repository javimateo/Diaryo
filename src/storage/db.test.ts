import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ImageElement, StrokeElement } from '../engine/elements';
import Dexie from 'dexie';
import {
  deletePage,
  DESK_INFO,
  DiaryoDB,
  dumpDiary,
  listLinks,
  listPages,
  listTexts,
  loadPage,
  mergeDiary,
  pruneEmptyPages,
  replaceDiary,
  restorePage,
  saveChanges,
  updatePage,
  type PageInfo,
} from './db';
import { parseBackup, parsePage, serializeDiary, serializePage } from './files';

const info = (id: string, date = '2026-09-24'): PageInfo => ({ id, date, order: 1, title: '' });

const stroke = (id: string, x = 0): StrokeElement => ({
  id,
  type: 'stroke',
  kind: 'pen',
  z: 1,
  x,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  points: [0, 0, 0.5, 10, 0, 0.5],
  simulatePressure: true,
  color: 'ink',
  size: 4,
  fill: null,
  fillStyle: 'solid',
  label: null,
});

const image: ImageElement = {
  id: 'img',
  type: 'image',
  z: 2,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  assetId: 'a1',
  width: 10,
  height: 10,
};

let db: DiaryoDB;

const never = (): never => {
  throw new Error('unreachable');
};
afterEach(async () => {
  await db?.delete();
});

const empty = { upserts: [], deletes: [], assets: [], fonts: [] };

describe('autosave to the database', () => {
  it('saves and restores elements, images and camera', async () => {
    db = new DiaryoDB('test-1');
    await saveChanges(db, info('p'), {
      ...empty,
      upserts: [stroke('s1'), image],
      assets: [{ id: 'a1', src: 'data:image/png;base64,AAAA' }],
      camera: { x: 5, y: 6, zoom: 2 },
    });
    const page = await loadPage(db, 'p');
    expect(page.elements.map((e) => e.id).sort()).toEqual(['img', 's1']);
    expect(page.assets).toHaveLength(1);
    expect(page.camera).toEqual({ x: 5, y: 6, zoom: 2 });
  });

  it('only writes what changes: update and delete', async () => {
    db = new DiaryoDB('test-2');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a'), stroke('b')] });
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a', 99)], deletes: ['b'] });
    const page = await loadPage(db, 'p');
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].x).toBe(99);
  });

  it("pages don't mix", async () => {
    db = new DiaryoDB('test-3');
    await saveChanges(db, info('p1'), { ...empty, upserts: [stroke('a')] });
    await saveChanges(db, info('p2'), { ...empty, upserts: [stroke('b')] });
    expect((await loadPage(db, 'p1')).elements.map((e) => e.id)).toEqual(['a']);
  });

  it('discards an image without its data instead of breaking the load', async () => {
    db = new DiaryoDB('test-4');
    await saveChanges(db, info('p'), { ...empty, upserts: [image, stroke('s')] });
    expect((await loadPage(db, 'p')).elements.map((e) => e.id)).toEqual(['s']);
  });
});

describe('diary pages', () => {
  it('the page is created on save with its day and keeps the title', async () => {
    db = new DiaryoDB('test-5');
    await updatePage(db, info('p', '2026-01-02'), { title: 'Ideas' });
    await saveChanges(db, info('p', '2026-01-02'), { ...empty, upserts: [stroke('a')] });
    const [page] = await listPages(db);
    expect(page).toMatchObject({ id: 'p', date: '2026-01-02', title: 'Ideas' });
  });

  it('discards empty untitled pages', async () => {
    db = new DiaryoDB('test-6');
    await saveChanges(db, info('vacia'), { ...empty, camera: { x: 0, y: 0, zoom: 1 } });
    await updatePage(db, info('titulada'), { title: 'Pendiente' });
    await saveChanges(db, info('llena'), { ...empty, upserts: [stroke('a')] });
    expect(await pruneEmptyPages(db)).toEqual(['vacia']);
    expect((await listPages(db)).map((p) => p.id).sort()).toEqual(['llena', 'titulada']);
  });

  it('deleting a page can be undone', async () => {
    db = new DiaryoDB('test-7');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a'), stroke('b')] });
    const stored = (await deletePage(db, 'p'))!;
    expect(await listPages(db)).toHaveLength(0);
    expect((await loadPage(db, 'p')).elements).toHaveLength(0);
    await restorePage(db, stored);
    expect((await loadPage(db, 'p')).elements).toHaveLength(2);
  });

  it('upgrades the phase 5 page (without a day) when opening the database', async () => {
    const old = new Dexie('test-8');
    old.version(1).stores({
      pages: 'id, updatedAt',
      elements: '[pageId+id], pageId',
      assets: 'id',
      fonts: 'id',
    });
    const created = new Date(2026, 8, 23, 18).getTime();
    await old
      .table('pages')
      .put({ id: 'main', title: '', createdAt: created, updatedAt: created, camera: null });
    old.close();
    db = new DiaryoDB('test-8');
    const [page] = await listPages(db);
    expect(page).toMatchObject({ id: 'main', date: '2026-09-23', order: created, thumbnail: null });
  });
});

describe('connections between pages', () => {
  it('lists which page links to which, without repeats and without the desk', async () => {
    db = new DiaryoDB('test-12');
    const linked = (id: string, link: string) => ({ ...stroke(id), link });
    await saveChanges(db, info('p'), {
      ...empty,
      upserts: [linked('a', 'q'), linked('b', 'q'), linked('c', 'p'), stroke('d')],
    });
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [linked('e', 'p')] });
    expect(await listLinks(db)).toEqual([{ from: 'p', to: 'q' }]);
  });
});

describe("a page's own paper", () => {
  it('it is saved, goes into backups and keeps the page even if empty', async () => {
    db = new DiaryoDB('test-14');
    await updatePage(db, info('agenda'), { paper: 'planner' });
    expect(await pruneEmptyPages(db)).toEqual([]);
    const [row] = await listPages(db);
    expect(row.paper).toBe('planner');
    const backup = parseBackup(serializeDiary(await dumpDiary(db)));
    if (backup?.kind !== 'diary') throw new Error('copia no válida');
    expect(backup.diary.pages[0].page.paper).toBe('planner');
    // An unknown paper in a backup is ignored.
    const tampered = serializeDiary(await dumpDiary(db)).replace('"planner"', '"hexagonal"');
    const parsed = parseBackup(tampered);
    if (parsed?.kind !== 'diary') throw new Error('copia no válida');
    expect(parsed.diary.pages[0].page.paper).toBeNull();
  });

  it('a page whose id is not one of diaryo is not read from a backup', () => {
    const page = { id: 'x', date: '2026-09-24', elements: [] };
    const file = (id: string) =>
      JSON.stringify({ type: 'diaryo/diary', version: 1, pages: [page, { ...page, id }] });
    const ids = (text: string) => {
      const backup = parseBackup(text);
      return backup?.kind === 'diary' ? backup.diary.pages.map((p) => p.page.id) : null;
    };
    expect(ids(file('a"><img src=x onerror=alert(1)>'))).toEqual(['x']);
    expect(ids(file('0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f2e'))).toHaveLength(2);
  });
});

describe('search', () => {
  it('lists what is written in texts, notes and shapes (also on the desk)', async () => {
    db = new DiaryoDB('test-13');
    const labelled = (id: string, text: string) => ({
      ...stroke(id),
      label: { text, fontSize: 20, font: 'x', align: 'center' as const, valign: 'middle' as const },
    });
    await saveChanges(db, info('p'), {
      ...empty,
      upserts: [labelled('a', 'Idea A'), labelled('b', '  '), stroke('c'), image],
    });
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [labelled('d', 'Comprar pan')] });
    expect(await listTexts(db)).toEqual([
      { pageId: DESK_INFO.id, elementId: 'd', type: 'stroke', text: 'Comprar pan' },
      { pageId: 'p', elementId: 'a', type: 'stroke', text: 'Idea A' },
    ]);
  });
});

describe('the desk', () => {
  it("it is saved as one more page, but doesn't show in the index and isn't discarded", async () => {
    db = new DiaryoDB('test-11');
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('postit')] });
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a')] });
    expect((await listPages(db)).map((p) => p.id)).toEqual(['p']);
    expect(await pruneEmptyPages(db)).toEqual([]);
    expect((await loadPage(db, DESK_INFO.id)).elements.map((e) => e.id)).toEqual(['postit']);
  });
});

describe('diary backups', () => {
  it('round trip of the whole diary', async () => {
    db = new DiaryoDB('test-9');
    await saveChanges(db, info('p1'), {
      ...empty,
      upserts: [stroke('a'), image],
      assets: [{ id: 'a1', src: 'data:image/png;base64,AAAA' }],
    });
    await saveChanges(db, info('p2', '2026-09-25'), { ...empty, upserts: [stroke('b')] });
    const backup = parseBackup(serializeDiary(await dumpDiary(db)));
    expect(backup?.kind).toBe('diary');
    if (backup?.kind !== 'diary') return;
    expect(backup.diary.pages.map((p) => [p.page.id, p.elements.length]).sort()).toEqual([
      ['p1', 2],
      ['p2', 1],
    ]);
    expect(backup.diary.assets).toHaveLength(1);
  });

  it("restoring a backup doesn't lose the most recent", async () => {
    db = new DiaryoDB('test-10');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('viejo')] });
    const dump = await dumpDiary(db);
    // After the backup, writing continues on "p" and "q" appears in the backup.
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('nuevo')] });
    const [copy] = dump.pages;
    dump.pages.push({
      page: { ...copy.page, id: 'q' },
      elements: copy.elements.map((row) => ({ ...row, pageId: 'q' })),
    });
    expect(await mergeDiary(db, dump)).toEqual(['q']);
    expect((await loadPage(db, 'p')).elements).toHaveLength(2);
    expect((await loadPage(db, 'q')).elements).toHaveLength(1);
  });

  it('the desk travels in the backup file and comes back when opening it', async () => {
    const note = {
      id: 'note',
      type: 'note' as const,
      z: 3,
      x: 900,
      y: 100,
      rotation: 0,
      opacity: 1,
      groupId: null,
      locked: false,
      variant: 'plain' as const,
      text: 'on the desk',
      fontSize: 20,
      color: 'yellow' as const,
      textColor: null,
      font: 'inter',
      align: 'left' as const,
      valign: 'top' as const,
      width: 220,
      height: 220,
    };
    const home = new DiaryoDB('test-17');
    await saveChanges(home, DESK_INFO, { ...empty, upserts: [note, stroke('s')] });
    const file = serializeDiary(await dumpDiary(home));
    home.close();
    await Dexie.delete('test-17');

    const backup = parseBackup(file);
    expect(backup?.kind).toBe('diary');
    db = new DiaryoDB('test-18');
    expect(await mergeDiary(db, backup!.kind === 'diary' ? backup!.diary : never())).toEqual([
      DESK_INFO.id,
    ]);
    const desk = (await loadPage(db, DESK_INFO.id)).elements;
    expect(desk.map((el) => el.id).sort()).toEqual(['note', 's']);
  });

  it('replacing leaves only the backup: its pages and its desk', async () => {
    const other = new DiaryoDB('test-19');
    await saveChanges(other, info('theirs'), { ...empty, upserts: [stroke('t')] });
    await saveChanges(other, DESK_INFO, { ...empty, upserts: [stroke('their-note')] });
    const copy = await dumpDiary(other);
    other.close();
    await Dexie.delete('test-19');

    db = new DiaryoDB('test-20');
    await saveChanges(db, info('mine'), { ...empty, upserts: [stroke('m')] });
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('my-note')] });
    await replaceDiary(db, copy);

    expect((await listPages(db)).map((p) => p.id)).toEqual(['theirs']);
    expect((await loadPage(db, 'mine')).elements).toHaveLength(0);
    const desk = (await loadPage(db, DESK_INFO.id)).elements;
    expect(desk.map((el) => el.id)).toEqual(['their-note']);
  });

  it('the desk merges with the one here: no note from either is lost', async () => {
    // On the web: the notes "a" and "b" on the desk.
    const web = new DiaryoDB('test-15');
    await saveChanges(web, DESK_INFO, { ...empty, upserts: [stroke('a'), stroke('b')] });
    const copy = await dumpDiary(web);
    web.close();
    await Dexie.delete('test-15');
    // In the app: another version of "a" (more recent) and a note "c" that is only here.
    db = new DiaryoDB('test-16');
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('a', 99), stroke('c')] });

    expect(await mergeDiary(db, copy)).toEqual([DESK_INFO.id]);
    const desk = (await loadPage(db, DESK_INFO.id)).elements;
    expect(desk.map((el) => el.id).sort()).toEqual(['a', 'b', 'c']);
    // What is in both stays as on the most recent desk (the one here).
    expect(desk.find((el) => el.id === 'a')?.x).toBe(99);
    // The same backup again: there is nothing new to merge.
    expect(await mergeDiary(db, copy)).toEqual([]);
  });
});

describe('file backups', () => {
  it('round trip', () => {
    const text = serializePage({
      elements: [stroke('s'), image],
      assets: [{ id: 'a1', src: 'data:image/png;base64,AAAA' }],
      fonts: [{ id: 'custom-1', name: 'Mía', src: 'data:font/ttf;base64,AAAA' }],
    });
    const page = parsePage(text)!;
    expect(page.elements).toHaveLength(2);
    expect(page.fonts[0].name).toBe('Mía');
  });

  it('reads a font only from inside the file, never from an address', () => {
    const text = serializePage({
      elements: [],
      assets: [],
      fonts: [
        { id: 'custom-1', name: 'Dentro', src: 'data:font/ttf;base64,AAAA' },
        { id: 'custom-2', name: 'Fuera', src: 'https://example.com/font.woff2' },
      ],
    });
    expect(parsePage(text)!.fonts.map((f) => f.name)).toEqual(['Dentro']);
  });

  it("rejects files that aren't from diaryo", () => {
    expect(parsePage('{}')).toBeNull();
    expect(parsePage('no es json')).toBeNull();
  });
});
