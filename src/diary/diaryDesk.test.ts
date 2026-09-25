import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { SceneElement, StrokeElement } from '../engine/elements';
import type { Engine } from '../engine/engine';
import { DESK_INFO, DiaryoDB, saveChanges } from '../storage/db';
import { Diary } from './diary';

const stroke = (id: string): StrokeElement => ({
  id,
  type: 'stroke',
  kind: 'pen',
  z: 1,
  x: 2000,
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

/** A minimal engine that records what it gets for the desk. */
function fakeEngine() {
  const loads: { elements: string[]; removed: string[] }[] = [];
  let deskIds: ReadonlySet<string> = new Set();
  const engine = {
    onPageTurn: () => {},
    onBookTab: () => {},
    setDeskIds: (ids: ReadonlySet<string>) => (deskIds = ids),
    assets: { add: () => {} },
    loadDesk: (elements: SceneElement[], removed: string[] = []) =>
      loads.push({ elements: elements.map((el) => el.id), removed }),
  };
  return { engine: engine as unknown as Engine, loads, deskIds: () => deskIds };
}

let db: DiaryoDB;
afterEach(async () => {
  await db?.delete();
});

const empty = { upserts: [], deletes: [], assets: [], fonts: [] };

describe('the diary desk when it changes in another window', () => {
  it('reloading it brings what is new and removes what was deleted there', async () => {
    db = new DiaryoDB('diary-desk');
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('a'), stroke('b')] });
    const { engine, loads, deskIds } = fakeEngine();
    const diary = new Diary(db, engine, {
      onState: () => {},
      onStatus: () => {},
      bookStyle: () => ({}) as never,
    });
    await diary.reloadDesk();
    expect(loads.at(-1)).toEqual({ elements: ['a', 'b'], removed: [] });

    // On the desktop desk "a" is deleted and "c" is added.
    await saveChanges(db, DESK_INFO, { ...empty, upserts: [stroke('c')], deletes: ['a'] });
    await diary.reloadDesk();
    expect(loads.at(-1)).toEqual({ elements: ['b', 'c'], removed: ['a'] });
    // The engine knows what belongs to the desk (even where the book opens).
    expect([...deskIds()].sort()).toEqual(['b', 'c']);
  });
});
