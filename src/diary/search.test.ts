import { describe, expect, it } from 'vitest';
import { findInText, matchesAll, matchesPrefixes, queryWords } from './search';

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
