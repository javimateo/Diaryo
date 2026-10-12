import { describe, expect, it } from 'vitest';
import { completeDates, findDates, parseDayQuery, parseTime, writeDate } from './when';

// Thursday.
const TODAY = '2026-09-24';

describe('parseDayQuery', () => {
  it('understands relative days', () => {
    expect(parseDayQuery('hoy', TODAY)).toBe(TODAY);
    expect(parseDayQuery('Ayer', TODAY)).toBe('2026-09-23');
    expect(parseDayQuery('mañana', TODAY)).toBe('2026-09-25');
    expect(parseDayQuery('pasado mañana', TODAY)).toBe('2026-09-26');
  });

  it('understands weekdays', () => {
    expect(parseDayQuery('lunes', TODAY)).toBe('2026-09-21');
    expect(parseDayQuery('jueves', TODAY)).toBe(TODAY);
    expect(parseDayQuery('el jueves pasado', TODAY)).toBe('2026-09-17');
    expect(parseDayQuery('Próximo lunes', TODAY)).toBe('2026-09-28');
    expect(parseDayQuery('viernes que viene', TODAY)).toBe('2026-09-25');
  });

  it('understands dates with numbers', () => {
    expect(parseDayQuery('24', TODAY)).toBe(TODAY);
    expect(parseDayQuery('3/10', TODAY)).toBe('2026-10-03');
    expect(parseDayQuery('24/9/2025', TODAY)).toBe('2025-09-24');
    expect(parseDayQuery('24-9-25', TODAY)).toBe('2025-09-24');
    expect(parseDayQuery('2025-12-31', TODAY)).toBe('2025-12-31');
  });

  it('understands written dates', () => {
    expect(parseDayQuery('24 sept', TODAY)).toBe(TODAY);
    expect(parseDayQuery('5 de enero de 2025', TODAY)).toBe('2025-01-05');
    expect(parseDayQuery('Jueves, 24 de septiembre', TODAY)).toBe(TODAY);
  });

  it('also understands days in English', () => {
    expect(parseDayQuery('yesterday', TODAY)).toBe('2026-09-23');
    expect(parseDayQuery('Monday', TODAY)).toBe('2026-09-21');
    expect(parseDayQuery('last thursday', TODAY)).toBe('2026-09-17');
    expect(parseDayQuery('next monday', TODAY)).toBe('2026-09-28');
    expect(parseDayQuery('Sep 24', TODAY)).toBe(TODAY);
    expect(parseDayQuery('September 5, 2025', TODAY)).toBe('2025-09-05');
    expect(parseDayQuery('Thursday, September 24', TODAY)).toBe(TODAY);
    expect(parseDayQuery('5th of January', TODAY)).toBe('2026-01-05');
  });

  it('in English, with numbers the month goes first', () => {
    expect(parseDayQuery('9/24', TODAY, true)).toBe(TODAY);
    expect(parseDayQuery('9/24', TODAY)).toBeNull();
  });

  it("discards what isn't a day", () => {
    expect(parseDayQuery('31/2', TODAY)).toBeNull();
    expect(parseDayQuery('32', TODAY)).toBeNull();
    expect(parseDayQuery('reunión', TODAY)).toBeNull();
    expect(parseDayQuery('3 ma', TODAY)).toBeNull();
    expect(parseDayQuery('', TODAY)).toBeNull();
  });
});

describe('parseDayQuery ahead (tasks and appointments)', () => {
  const ahead = (query: string) => parseDayQuery(query, TODAY, false, true);

  it('looks forward when nothing else is said', () => {
    expect(ahead('lunes')).toBe('2026-09-28');
    expect(ahead('jueves')).toBe(TODAY);
    expect(ahead('vie')).toBe('2026-09-25');
    expect(ahead('20/9')).toBe('2027-09-20');
    expect(ahead('24/9')).toBe(TODAY);
    expect(ahead('3/1')).toBe('2027-01-03');
    expect(ahead('15')).toBe('2026-10-15');
    expect(ahead('30')).toBe('2026-09-30');
  });

  it('keeps what is said', () => {
    expect(ahead('el lunes pasado')).toBe('2026-09-21');
    expect(ahead('20/9/2026')).toBe('2026-09-20');
    expect(ahead('ayer')).toBe('2026-09-23');
  });

  it('understands short weekdays in the search too', () => {
    expect(parseDayQuery('vie', TODAY)).toBe('2026-09-18');
    expect(parseDayQuery('Mar 10', TODAY)).toBe('2026-03-10');
  });
});

describe('parseTime', () => {
  it('reads times', () => {
    expect(parseTime('10')).toBe(600);
    expect(parseTime('10:30')).toBe(630);
    expect(parseTime('9.05')).toBe(545);
    expect(parseTime('10h')).toBe(600);
    expect(parseTime('5pm')).toBe(1020);
    expect(parseTime('12am')).toBe(0);
  });

  it('refuses what is not a time', () => {
    expect(parseTime('25')).toBeNull();
    expect(parseTime('10:75')).toBeNull();
    expect(parseTime('13pm')).toBeNull();
    expect(parseTime('diez')).toBeNull();
  });
});

describe('findDates', () => {
  const find = (line: string) => findDates(line, TODAY);

  it('finds a day and a time after an "@"', () => {
    const line = '[ ] Dentista @mañana 10';
    expect(find(line)).toEqual([{ day: '2026-09-25', time: 600, start: 13, end: line.length }]);
  });

  it('leaves out the punctuation after it', () => {
    const line = 'Cena @sab 21:30, con Ana';
    expect(find(line)).toEqual([{ day: '2026-09-26', time: 1290, start: 5, end: 15 }]);
  });

  it('reads the full form, with the end of an appointment', () => {
    expect(find('@15 oct 2026 10:00-11:30 consulta')).toEqual([
      { day: '2026-10-15', time: 600, until: 690, start: 0, end: 24 },
    ]);
  });

  it('takes a time alone as today', () => {
    expect(find('Llamar @10:00')).toEqual([{ day: TODAY, time: 600, start: 7, end: 13 }]);
  });

  it('finds several in a line', () => {
    expect(find('@lunes y @martes').map((mark) => mark.day)).toEqual(['2026-09-28', '2026-09-29']);
  });

  it("doesn't take emails or names", () => {
    expect(find('ana@mail.com')).toEqual([]);
    expect(find('@Lucía viene')).toEqual([]);
    expect(find('@ mañana')).toEqual([]);
  });
});

describe('completeDates', () => {
  it('writes the dates in full, in the language', () => {
    expect(completeDates('[ ] Dentista @mañana 10', TODAY, 'es')).toBe(
      '[ ] Dentista @25 sep 2026 10:00',
    );
    expect(completeDates('Call @9/25 5pm', TODAY, 'en', true)).toBe('Call @25 Sep 2026 17:00');
    expect(completeDates('Cena @sab 21:30-23\nnada', TODAY, 'es')).toBe(
      'Cena @26 sep 2026 21:30-23:00\nnada',
    );
  });

  it('leaves the full form as it is, also in the other language', () => {
    for (const text of ['@3 ene 2027 9:05', '@3 Jan 2027 9:05']) {
      expect(completeDates(text, TODAY, 'es')).toBe('@3 ene 2027 9:05');
      expect(findDates(text, TODAY)).toEqual([
        { day: '2027-01-03', time: 545, start: 0, end: text.length },
      ]);
    }
  });

  it('writes every month so it is read back', () => {
    for (let month = 1; month <= 12; month++) {
      const day = `2027-${String(month).padStart(2, '0')}-02`;
      for (const language of ['es', 'en'] as const) {
        expect(findDates(writeDate({ day }, language), TODAY)[0].day).toBe(day);
      }
    }
  });
});
