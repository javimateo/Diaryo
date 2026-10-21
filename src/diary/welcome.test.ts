import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementBounds } from '../engine/elements';
import { es } from '../i18n/es';
import { DESK_ID, DiaryoDB, loadPage, saveChanges } from '../storage/db';
import { onlyWelcome, seedWelcome, WELCOME_PAGE, WELCOME_PREFIX, welcomeElements } from './welcome';

const texts = es.welcome.page;

describe('welcome page', () => {
  it('fits on the pages, with its note on the desk beside the book', () => {
    const { page, desk } = welcomeElements(texts, '2026-10-12', 'es');
    for (const el of page) {
      const b = elementBounds(el);
      expect(b.minX).toBeGreaterThan(-760);
      expect(b.maxX).toBeLessThan(760);
      expect(b.minY).toBeGreaterThan(-520);
      expect(b.maxY).toBeLessThan(520);
    }
    expect(elementBounds(desk[0]).minX).toBeGreaterThan(784);
  });

  it('every id is its own and starts the same way', () => {
    const { page, desk } = welcomeElements(texts, '2026-10-12', 'es');
    const ids = [...page, ...desk].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith(WELCOME_PREFIX))).toBe(true);
  });

  it('has a task for tomorrow and an appointment the day after, written in full', () => {
    const { page } = welcomeElements(texts, '2026-10-12', 'es');
    const words = page.flatMap((el) => ('text' in el ? [el.text] : []));
    expect(
      words.some((w) => w.includes('[ ] Ponerle fecha a una tarea con @ @13 oct 2026 10:00')),
    ).toBe(true);
    expect(words).toContain('Café con Ana\n@14 oct 2026 18:00');
  });
});

describe('putting the welcome page', () => {
  const saved = new Map<string, string>();
  beforeEach(() => {
    saved.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('only in an empty diary, and only once', async () => {
    const db = new DiaryoDB('welcome-1');
    expect(await seedWelcome(db, texts, 'es')).toBe(true);
    expect((await loadPage(db, WELCOME_PAGE)).elements.length).toBeGreaterThan(5);
    expect((await loadPage(db, DESK_ID)).elements).toHaveLength(1);
    // Cleared later: it doesn't come back.
    await db.elements.clear();
    await db.pages.clear();
    expect(await seedWelcome(db, texts, 'es')).toBe(false);
  });

  it('never in a diary that already has something', async () => {
    const db = new DiaryoDB('welcome-2');
    await db.pages.put({
      id: 'p1',
      date: '2026-10-01',
      order: 1,
      title: 'Mía',
      createdAt: 1,
      updatedAt: 1,
      camera: null,
      thumbnail: null,
    });
    expect(await seedWelcome(db, texts, 'es')).toBe(false);
    expect(await db.pages.count()).toBe(1);
  });

  it('as it was put, it is only the sample; changed, it is a diary of its own', async () => {
    const db = new DiaryoDB('welcome-3');
    expect(await onlyWelcome(db)).toBe(false);
    await seedWelcome(db, texts, 'es');
    expect(await onlyWelcome(db)).toBe(true);
    const [first] = (await loadPage(db, WELCOME_PAGE)).elements;
    await saveChanges(
      db,
      { id: WELCOME_PAGE, date: '2026-10-20', order: 1, title: '' },
      {
        upserts: [{ ...first, x: first.x + 10 }],
        deletes: [],
        assets: [],
        fonts: [],
      },
    );
    expect(await onlyWelcome(db)).toBe(false);
  });
});
