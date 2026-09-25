import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { StrokeElement } from '../engine/elements';
import type { Engine } from '../engine/engine';
import { Scene } from '../engine/scene';
import { Autosave, type Desk } from './autosave';
import { DESK_ID, DESK_INFO, DiaryoDB, loadPage, saveChanges, type PageInfo } from './db';

/**
 * Lo que va a la página y lo que va a la mesa al guardar (con una base de datos de
 * verdad en memoria y un motor mínimo: solo su escena).
 */

const PAGE: PageInfo = { id: 'hoy', date: '2026-09-25', order: 1, title: '' };
/** Dentro del libro (x = 0) y fuera, a la derecha (x = 2000). */
const INSIDE = 0;
const OUTSIDE = 2000;

const stroke = (id: string, x: number): StrokeElement => ({
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

function fakeEngine() {
  const scene = new Scene();
  const engine = {
    scene,
    assets: { onAdd: () => {}, add: () => {} },
    loadPage: (elements: StrokeElement[]) => scene.apply(new Map(elements.map((e) => [e.id, e]))),
    subscribe: () => () => {},
  };
  return engine as unknown as Engine;
}

let db: DiaryoDB;
let count = 0;
afterEach(async () => {
  await db?.delete();
});

/** Un diario con la página de hoy abierta y lo que haya ya guardado en la mesa. */
async function open(deskElements: StrokeElement[] = []) {
  db = new DiaryoDB(`autosave-desk-${++count}`);
  const empty = { upserts: [], deletes: [], assets: [], fonts: [] };
  if (deskElements.length) await saveChanges(db, DESK_INFO, { ...empty, upserts: deskElements });
  const engine = fakeEngine();
  engine.loadPage(deskElements as never);
  let deskSaves = 0;
  const desk: Desk = {
    ids: new Set(deskElements.map((el) => el.id)),
    onPage: new Map(deskElements.map((el) => [el.id, el.x === INSIDE])),
    onSaved: () => deskSaves++,
  };
  const autosave = new Autosave(
    db,
    engine,
    () => PAGE,
    () => {},
    true,
    desk,
  );
  await autosave.start();
  const move = (id: string, x: number) =>
    engine.scene.apply(new Map([[id, { ...(engine.scene.get(id) as StrokeElement), x }]]));
  const ids = async (pageId: string) => (await loadPage(db, pageId)).elements.map((el) => el.id);
  return { engine, autosave, desk, move, ids, deskSaves: () => deskSaves };
}

describe('la mesa y la página al guardar', () => {
  it('lo nuevo va a donde queda: dentro del libro a la página, fuera a la mesa', async () => {
    const { engine, autosave, ids, deskSaves } = await open();
    engine.scene.apply(
      new Map([
        ['dentro', stroke('dentro', INSIDE)],
        ['fuera', stroke('fuera', OUTSIDE)],
      ]),
    );
    await autosave.flush();
    expect(await ids(PAGE.id)).toEqual(['dentro']);
    expect(await ids(DESK_ID)).toEqual(['fuera']);
    expect(deskSaves()).toBe(1);
  });

  it('lo de la mesa que está donde se abre el libro sigue en la mesa al cambiarlo', async () => {
    // Puesto ahí desde el escritorio: es de la mesa aunque caiga dentro del libro.
    const { move, autosave, ids } = await open([stroke('nota', INSIDE)]);
    move('nota', INSIDE + 50);
    await autosave.flush();
    expect(await ids(DESK_ID)).toEqual(['nota']);
    expect(await ids(PAGE.id)).toEqual([]);
  });

  it('al cruzar el borde del libro pasa de la página a la mesa, y al volver, a la página', async () => {
    const { engine, move, autosave, ids } = await open();
    engine.scene.apply(new Map([['s', stroke('s', INSIDE)]]));
    await autosave.flush();
    move('s', OUTSIDE);
    await autosave.flush();
    expect(await ids(PAGE.id)).toEqual([]);
    expect(await ids(DESK_ID)).toEqual(['s']);
    move('s', INSIDE);
    await autosave.flush();
    expect(await ids(PAGE.id)).toEqual(['s']);
    expect(await ids(DESK_ID)).toEqual([]);
  });

  it('borrar algo de la mesa lo quita de la mesa', async () => {
    const { engine, autosave, desk, ids } = await open([stroke('nota', OUTSIDE)]);
    engine.scene.apply(new Map([['nota', null]]));
    await autosave.flush();
    expect(await ids(DESK_ID)).toEqual([]);
    expect(desk.ids.has('nota')).toBe(false);
  });
});
