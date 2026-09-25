import { describe, expect, it } from 'vitest';
import { continueList, indent, taskShortcut } from './textEditing';

const at = (value: string) => value.length;

describe('listas al escribir', () => {
  it('Enter continúa la lista con la misma viñeta', () => {
    const value = '- pan';
    expect(continueList(value, at(value), at(value))).toEqual({
      value: '- pan\n- ',
      start: 8,
      end: 8,
    });
  });

  it('los números cuentan y las casillas salen vacías', () => {
    expect(continueList('1. uno', 6, 6)?.value).toBe('1. uno\n2. ');
    expect(continueList('[x] hecho', 9, 9)?.value).toBe('[x] hecho\n[ ] ');
    expect(continueList('  • dentro', 10, 10)?.value).toBe('  • dentro\n  • ');
  });

  it('Enter en una viñeta vacía termina la lista', () => {
    const value = '- pan\n- ';
    expect(continueList(value, at(value), at(value))).toEqual({
      value: '- pan\n',
      start: 6,
      end: 6,
    });
  });

  it('fuera de una lista no hace nada', () => {
    expect(continueList('hola', 4, 4)).toBeNull();
    expect(continueList('-pegado', 7, 7)).toBeNull();
  });
});

describe('Tab al escribir', () => {
  it('fuera de listas añade un espaciado', () => {
    expect(indent('ab', 1, 1, false)).toEqual({ value: 'a    b', start: 5, end: 5 });
  });

  it('en una lista mete la línea hacia dentro y Shift+Tab la saca', () => {
    const inside = indent('- pan', 5, 5, false);
    expect(inside.value).toBe('    - pan');
    expect(inside.start).toBe(9);
    expect(indent(inside.value, 9, 9, true).value).toBe('- pan');
  });

  it('con varias líneas seleccionadas las mueve todas', () => {
    const value = 'uno\ndos\ntres';
    expect(indent(value, 0, value.length, false).value).toBe('    uno\n    dos\n    tres');
  });
});

describe('tareas', () => {
  it('"[]" y espacio al principio de una línea se convierte en tarea', () => {
    expect(taskShortcut('Hoy\n[]', 6, 6)).toEqual({ value: 'Hoy\n[ ] ', start: 8, end: 8 });
    expect(taskShortcut('a []', 4, 4)).toBeNull();
  });

  it('Enter en una tarea sigue con otra por hacer', () => {
    const value = '[x] pan';
    expect(continueList(value, value.length, value.length)?.value).toBe('[x] pan\n[ ] ');
  });
});
