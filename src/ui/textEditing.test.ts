import { describe, expect, it } from 'vitest';
import { continueList, dateInProgress, indent, replaceDate, taskShortcut } from './textEditing';

const at = (value: string) => value.length;

describe('lists while typing', () => {
  it('Enter continues the list with the same bullet', () => {
    const value = '- pan';
    expect(continueList(value, at(value), at(value))).toEqual({
      value: '- pan\n- ',
      start: 8,
      end: 8,
    });
  });

  it('numbers count up and checkboxes start empty', () => {
    expect(continueList('1. uno', 6, 6)?.value).toBe('1. uno\n2. ');
    expect(continueList('[x] hecho', 9, 9)?.value).toBe('[x] hecho\n[ ] ');
    expect(continueList('  • dentro', 10, 10)?.value).toBe('  • dentro\n  • ');
  });

  it('Enter on an empty bullet ends the list', () => {
    const value = '- pan\n- ';
    expect(continueList(value, at(value), at(value))).toEqual({
      value: '- pan\n',
      start: 6,
      end: 6,
    });
  });

  it('outside a list it does nothing', () => {
    expect(continueList('hola', 4, 4)).toBeNull();
    expect(continueList('-pegado', 7, 7)).toBeNull();
  });
});

describe('Tab while typing', () => {
  it('outside lists it adds spacing', () => {
    expect(indent('ab', 1, 1, false)).toEqual({ value: 'a    b', start: 5, end: 5 });
  });

  it('in a list it indents the line and Shift+Tab outdents it', () => {
    const inside = indent('- pan', 5, 5, false);
    expect(inside.value).toBe('    - pan');
    expect(inside.start).toBe(9);
    expect(indent(inside.value, 9, 9, true).value).toBe('- pan');
  });

  it('with several lines selected it moves them all', () => {
    const value = 'uno\ndos\ntres';
    expect(indent(value, 0, value.length, false).value).toBe('    uno\n    dos\n    tres');
  });
});

describe('tasks', () => {
  it('"[]" and space at the start of a line becomes a task', () => {
    expect(taskShortcut('Hoy\n[]', 6, 6)).toEqual({ value: 'Hoy\n[ ] ', start: 8, end: 8 });
    expect(taskShortcut('a []', 4, 4)).toBeNull();
  });

  it('Enter on a task continues with another one to do', () => {
    const value = '[x] pan';
    expect(continueList(value, value.length, value.length)?.value).toBe('[x] pan\n[ ] ');
  });
});

describe('the date being written', () => {
  // Thursday.
  const TODAY = '2026-09-24';
  const writing = (value: string) => dateInProgress(value, value.length, TODAY, false);

  it('starts with an "@" at the start of a word', () => {
    expect(writing('[ ] Dentista @')).toEqual({ start: 13, when: null });
    expect(writing('Dentista @mañ')).toEqual({ start: 9, when: null });
    expect(writing('ana@')).toBeNull();
    expect(writing('@lunes\nnada')).toBeNull();
  });

  it('says what is understood, also with a space after it', () => {
    expect(writing('Dentista @mañana 10')).toEqual({
      start: 9,
      when: { day: '2026-09-25', time: 600, until: undefined },
    });
    expect(writing('@vie ')?.when?.day).toBe('2026-09-25');
  });

  it('ends when it is just text', () => {
    expect(writing('@Lucía viene')).toBeNull();
    expect(writing('@mañana 10 llevar')).toBeNull();
  });

  it('is replaced, with a space to keep writing', () => {
    expect(replaceDate('Ir @mañ', 3, 7, '@25 sep 2026', true)).toEqual({
      value: 'Ir @25 sep 2026 ',
      start: 16,
      end: 16,
    });
    expect(replaceDate('Ir @vie al cine', 3, 7, '@25 sep 2026', true).value).toBe(
      'Ir @25 sep 2026 al cine',
    );
    expect(replaceDate('@mañ', 0, 4, '@25 sep 2026', false).end).toBe(12);
  });
});
