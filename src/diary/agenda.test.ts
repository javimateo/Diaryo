import { describe, expect, it } from 'vitest';
import { agendaItems, upcoming, type AgendaItem } from './agenda';
import type { TextEntry } from '../storage/db';

// Monday 12 October 2026, 12:30.
const TODAY = '2026-10-12';
const NOW = new Date(2026, 9, 12, 12, 30).getTime();

const entry = (text: string, elementId = 'e'): TextEntry => ({
  pageId: 'p',
  elementId,
  type: 'note',
  text,
});

describe('agendaItems', () => {
  it('finds the dated lines, tasks or appointments', () => {
    const items = agendaItems(
      [
        entry('Compra\n[ ] Dentista @13 oct 2026 10:00\n[x] Llamar @9 oct 2026\nnada'),
        entry('Cena con Lucía @17 oct 2026 21:30-23:00', 'f'),
        entry('sin fechas, ana@mail.com', 'g'),
      ],
      TODAY,
      false,
    );
    expect(items).toEqual([
      {
        pageId: 'p',
        elementId: 'e',
        line: 1,
        text: 'Dentista',
        task: 'open',
        day: '2026-10-13',
        time: 600,
        until: undefined,
      },
      expect.objectContaining({ line: 2, text: 'Llamar', task: 'done', day: '2026-10-09' }),
      expect.objectContaining({ elementId: 'f', text: 'Cena con Lucía', task: null, until: 1380 }),
    ]);
  });

  it('names a line with only a date after the element', () => {
    const [item] = agendaItems([entry('Médico\n@15 oct 2026 10:00')], TODAY, false);
    expect(item.text).toBe('Médico');
  });
});

describe('upcoming', () => {
  const item = (text: string, day: string, more: Partial<AgendaItem> = {}): AgendaItem => ({
    pageId: 'p',
    elementId: text,
    line: 0,
    text,
    task: 'open',
    day,
    ...more,
  });
  const titles = (items: AgendaItem[]) =>
    upcoming(items, NOW, 1).map(({ group, items }) => [group, items.map((i) => i.text)]);

  it('groups what is pending, in time order', () => {
    expect(
      titles([
        item('después', '2026-10-30'),
        item('domingo', '2026-10-18'),
        item('mañana', '2026-10-13', { time: 600 }),
        item('hoy tarde', TODAY, { time: 17 * 60 }),
        item('hoy', TODAY),
        item('ayer', '2026-10-11'),
        item('esta mañana', TODAY, { time: 9 * 60 }),
      ]),
    ).toEqual([
      ['late', ['ayer', 'esta mañana']],
      ['today', ['hoy', 'hoy tarde']],
      ['tomorrow', ['mañana']],
      ['week', ['domingo']],
      ['later', ['después']],
    ]);
  });

  it('leaves out done tasks and appointments already over', () => {
    expect(
      titles([
        item('hecha', '2026-10-13', { task: 'done' }),
        item('cita pasada', TODAY, { task: null, time: 9 * 60 }),
        item('cita en curso', TODAY, { task: null, time: 12 * 60, until: 13 * 60 }),
        item('cita de hoy', TODAY, { task: null }),
      ]),
    ).toEqual([['today', ['cita de hoy', 'cita en curso']]]);
  });

  it('ends the week on the day before it starts again', () => {
    expect(upcoming([item('domingo', '2026-10-18')], NOW, 0)[0].group).toBe('later');
  });
});
