import { describe, expect, it } from 'vitest';
import { remindAt, type AgendaItem } from './agenda';
import type { PageMeta } from './pages';
import { buildReminders, missedReminder } from './reminders';
import { DESK_ID } from '../storage/db';

// Monday 12 October 2026, 12:30.
const NOW = new Date(2026, 9, 12, 12, 30).getTime();
const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 9, day, hours, minutes).getTime();

const item = (text: string, day: string, more: Partial<AgendaItem> = {}): AgendaItem => ({
  pageId: DESK_ID,
  elementId: text,
  line: 0,
  text,
  task: 'open',
  day,
  ...more,
});

const PAGES: PageMeta[] = [
  { id: 'p', date: '2026-10-09', order: 1, title: 'Viaje a Lisboa' } as PageMeta,
];

describe('remindAt', () => {
  it('reminds at its time, or at 9:00 without one, that long before', () => {
    expect(remindAt({ day: '2026-10-13', time: 600 }, 0)).toBe(at(13, 10));
    expect(remindAt({ day: '2026-10-13' }, 0)).toBe(at(13, 9));
    expect(remindAt({ day: '2026-10-13', time: 600 }, 30)).toBe(at(13, 9, 30));
    expect(remindAt({ day: '2026-10-13' }, 1440)).toBe(at(12, 9));
  });
});

describe('buildReminders', () => {
  it('only what is pending and still to come, in order', () => {
    const list = buildReminders(
      [
        item('Cena', '2026-10-17', { task: null, time: 21 * 60 + 30 }),
        item('Hecha', '2026-10-13', { task: 'done', time: 600 }),
        item('Ya pasó', '2026-10-12', { time: 600 }),
        item('Dentista', '2026-10-13', { time: 600, pageId: 'p' }),
      ],
      NOW,
      0,
      false,
      PAGES,
    );
    expect(list.map((r) => [r.title, r.body, r.at])).toEqual([
      ['Dentista', 'Mañana a las 10:00 · Viaje a Lisboa', at(13, 10)],
      ['Cena', 'Sábado, 17 de octubre a las 21:30 · Mesa', at(17, 21, 30)],
    ]);
    expect(list[0]).toMatchObject({ pageId: 'p', elementId: 'Dentista' });
  });

  it('keeps the words of private notes, and of all with the diary locked, out', () => {
    const items = [
      item('Clave del banco', '2026-10-13', { private: true }),
      item('Pan', '2026-10-13'),
    ];
    const [secret, open] = buildReminders(items, NOW, 0, false, PAGES);
    expect([secret.title, secret.body]).toEqual([
      'Tienes un recordatorio',
      'Mañana, todo el día · Ábrelo en diaryo para verlo',
    ]);
    expect(open.title).toBe('Pan');
    expect(buildReminders(items, NOW, 0, true, PAGES).map((r) => r.title)).toEqual([
      'Tienes un recordatorio',
      'Tienes un recordatorio',
    ]);
  });

  it('also what came due since the list was last sent, still pending', () => {
    const items = [
      item('Recién escrita', '2026-10-12', { task: null, time: 12 * 60 + 29 }),
      item('De antes', '2026-10-12', { task: null, time: 12 * 60 + 20 }),
    ];
    const since = at(12, 12, 25);
    const titles = (from?: number) =>
      buildReminders(items, NOW, 0, false, PAGES, from).map((r) => r.title);
    expect(titles(since)).toEqual(['Recién escrita']);
    expect(titles()).toEqual([]);
  });

  it('keeps the same key for the same reminder', () => {
    const [a] = buildReminders([item('Pan', '2026-10-13')], NOW, 0, false, PAGES);
    const [b] = buildReminders([item('Pan', '2026-10-13')], NOW + 60_000, 0, false, PAGES);
    expect(a.key).toBe(b.key);
  });
});

describe('missedReminder', () => {
  it('tells what reminded while closed and is still pending', () => {
    const missed = missedReminder(
      [
        item('Pagar el seguro', '2026-10-12', { time: 10 * 60 }),
        item('Llamar a Ana', '2026-10-12', { time: 11 * 60 }),
        item('Secreto', '2026-10-12', { time: 11 * 60, private: true }),
        item('Hecha', '2026-10-12', { time: 11 * 60, task: 'done' }),
        item('Antes de cerrar', '2026-10-12', { time: 8 * 60 }),
        item('Luego', '2026-10-12', { time: 18 * 60 }),
      ],
      at(12, 9),
      NOW,
      0,
      false,
    );
    expect(missed).toMatchObject({
      title: '3 avisos mientras diaryo estaba cerrado',
      body: 'Pagar el seguro · Llamar a Ana',
    });
  });

  it('forgets what is older than a day, and says nothing if nothing was missed', () => {
    const old = item('Hace mucho', '2026-10-10', { time: 600 });
    expect(missedReminder([old], at(1, 9), NOW, 0, false)).toBeNull();
  });
});
