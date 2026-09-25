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
afterEach(async () => {
  await db?.delete();
});

const empty = { upserts: [], deletes: [], assets: [], fonts: [] };

describe('autoguardado en la base de datos', () => {
  it('guarda y recupera elementos, imágenes y cámara', async () => {
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

  it('solo escribe lo que cambia: actualizar y borrar', async () => {
    db = new DiaryoDB('test-2');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a'), stroke('b')] });
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a', 99)], deletes: ['b'] });
    const page = await loadPage(db, 'p');
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].x).toBe(99);
  });

  it('las páginas no se mezclan', async () => {
    db = new DiaryoDB('test-3');
    await saveChanges(db, info('p1'), { ...empty, upserts: [stroke('a')] });
    await saveChanges(db, info('p2'), { ...empty, upserts: [stroke('b')] });
    expect((await loadPage(db, 'p1')).elements.map((e) => e.id)).toEqual(['a']);
  });

  it('descarta una imagen sin sus datos en lugar de romper la carga', async () => {
    db = new DiaryoDB('test-4');
    await saveChanges(db, info('p'), { ...empty, upserts: [image, stroke('s')] });
    expect((await loadPage(db, 'p')).elements.map((e) => e.id)).toEqual(['s']);
  });
});

describe('páginas del diario', () => {
  it('la página se crea al guardar con su día y conserva el título', async () => {
    db = new DiaryoDB('test-5');
    await updatePage(db, info('p', '2026-01-02'), { title: 'Ideas' });
    await saveChanges(db, info('p', '2026-01-02'), { ...empty, upserts: [stroke('a')] });
    const [page] = await listPages(db);
    expect(page).toMatchObject({ id: 'p', date: '2026-01-02', title: 'Ideas' });
  });

  it('descarta las páginas vacías sin título', async () => {
    db = new DiaryoDB('test-6');
    await saveChanges(db, info('vacia'), { ...empty, camera: { x: 0, y: 0, zoom: 1 } });
    await updatePage(db, info('titulada'), { title: 'Pendiente' });
    await saveChanges(db, info('llena'), { ...empty, upserts: [stroke('a')] });
    expect(await pruneEmptyPages(db)).toEqual(['vacia']);
    expect((await listPages(db)).map((p) => p.id).sort()).toEqual(['llena', 'titulada']);
  });

  it('borrar una página se puede deshacer', async () => {
    db = new DiaryoDB('test-7');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a'), stroke('b')] });
    const stored = (await deletePage(db, 'p'))!;
    expect(await listPages(db)).toHaveLength(0);
    expect((await loadPage(db, 'p')).elements).toHaveLength(0);
    await restorePage(db, stored);
    expect((await loadPage(db, 'p')).elements).toHaveLength(2);
  });

  it('actualiza la página de la fase 5 (sin día) al abrir la base de datos', async () => {
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

describe('conexiones entre páginas', () => {
  it('lista qué página enlaza con cuál, sin repetir y sin la mesa', async () => {
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

describe('hoja propia de una página', () => {
  it('se guarda, va en las copias y guarda la página aunque esté vacía', async () => {
    db = new DiaryoDB('test-14');
    await updatePage(db, info('agenda'), { paper: 'planner' });
    expect(await pruneEmptyPages(db)).toEqual([]);
    const [row] = await listPages(db);
    expect(row.paper).toBe('planner');
    const backup = parseBackup(serializeDiary(await dumpDiary(db)));
    if (backup?.kind !== 'diary') throw new Error('copia no válida');
    expect(backup.diary.pages[0].page.paper).toBe('planner');
    // Una hoja desconocida en una copia se ignora.
    const tampered = serializeDiary(await dumpDiary(db)).replace('"planner"', '"hexagonal"');
    const parsed = parseBackup(tampered);
    if (parsed?.kind !== 'diary') throw new Error('copia no válida');
    expect(parsed.diary.pages[0].page.paper).toBeNull();
  });
});

describe('buscar', () => {
  it('lista lo escrito en textos, notas y figuras (también en la mesa)', async () => {
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

describe('la mesa', () => {
  it('se guarda como una página más, pero no sale en el índice ni se descarta', async () => {
    db = new DiaryoDB('test-11');
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('postit')] });
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('a')] });
    expect((await listPages(db)).map((p) => p.id)).toEqual(['p']);
    expect(await pruneEmptyPages(db)).toEqual([]);
    expect((await loadPage(db, DESK_INFO.id)).elements.map((e) => e.id)).toEqual(['postit']);
  });
});

describe('copias del diario', () => {
  it('ida y vuelta de todo el diario', async () => {
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

  it('al recuperar una copia no se pierde lo más reciente', async () => {
    db = new DiaryoDB('test-10');
    await saveChanges(db, info('p'), { ...empty, upserts: [stroke('viejo')] });
    const dump = await dumpDiary(db);
    // Después de la copia se sigue escribiendo en "p" y aparece "q" en la copia.
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

  it('la mesa se junta con la de aquí: no se pierde ningún pósit de ninguna', async () => {
    // En la web: los pósits "a" y "b" en la mesa.
    const web = new DiaryoDB('test-15');
    await saveChanges(web, DESK_INFO, { ...empty, upserts: [stroke('a'), stroke('b')] });
    const copy = await dumpDiary(web);
    web.close();
    await Dexie.delete('test-15');
    // En la app: otra versión de "a" (más reciente) y un pósit "c" que solo está aquí.
    db = new DiaryoDB('test-16');
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('a', 99), stroke('c')] });

    expect(await mergeDiary(db, copy)).toEqual([DESK_INFO.id]);
    const desk = (await loadPage(db, DESK_INFO.id)).elements;
    expect(desk.map((el) => el.id).sort()).toEqual(['a', 'b', 'c']);
    // Lo que está en las dos se queda como en la mesa más reciente (la de aquí).
    expect(desk.find((el) => el.id === 'a')?.x).toBe(99);
    // Otra vez la misma copia: ya no hay nada nuevo que juntar.
    expect(await mergeDiary(db, copy)).toEqual([]);
  });
});

describe('copias en archivo', () => {
  it('ida y vuelta', () => {
    const text = serializePage({
      elements: [stroke('s'), image],
      assets: [{ id: 'a1', src: 'data:image/png;base64,AAAA' }],
      fonts: [{ id: 'custom-1', name: 'Mía', src: 'data:font/ttf;base64,AAAA' }],
    });
    const page = parsePage(text)!;
    expect(page.elements).toHaveLength(2);
    expect(page.fonts[0].name).toBe('Mía');
  });

  it('rechaza archivos que no son de diaryo', () => {
    expect(parsePage('{}')).toBeNull();
    expect(parsePage('no es json')).toBeNull();
  });
});
