import { describe, expect, it } from 'vitest';
import { findInText, matchesAll, matchesPrefixes, parseDayQuery, queryWords } from './search';

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

describe('findInText', () => {
  it('marks the match ignoring accents and case', () => {
    expect(findInText('Comprar leche y pan', queryWords('LECHE'))).toEqual({
      text: 'Comprar leche y pan',
      marks: [[8, 13]],
    });
    expect(findInText('Mañana: reunión', queryWords('reunion'))?.marks).toEqual([[8, 15]]);
  });

  it('needs every word and marks them all', () => {
    expect(findInText('hola mundo', queryWords('hola adiós'))).toBeNull();
    expect(findInText('pan, leche y más pan', queryWords('pan leche'))?.marks).toEqual([
      [0, 3],
      [5, 10],
      [17, 20],
    ]);
  });

  it('puts the text on one line and starts near the match', () => {
    const text = `${'palabra '.repeat(20)}\n\nla idea importante`;
    const snippet = findInText(text, queryWords('idea'))!;
    expect(snippet.text.startsWith('…')).toBe(true);
    expect(snippet.text).not.toContain('\n');
    expect(snippet.text.endsWith('la idea importante')).toBe(true);
    const [a, b] = snippet.marks[0];
    expect(snippet.text.slice(a, b)).toBe('idea');
  });

  it('matchesPrefixes searches by the start of words', () => {
    expect(matchesPrefixes('Lápiz · herramienta', queryWords('lap'))).toBe(true);
    expect(matchesPrefixes('Ver todo · encajar ajustar', queryWords('caja'))).toBe(false);
    expect(matchesPrefixes('Jueves, 24 de septiembre', queryWords('24 sept'))).toBe(true);
  });

  it('matchesAll compares without accents', () => {
    expect(matchesAll('Reunión del lunes', queryWords('reunion lunes'))).toBe(true);
    expect(matchesAll('Reunión del lunes', queryWords('martes'))).toBe(false);
  });
});
