import { afterEach, describe, expect, it, vi } from 'vitest';
import { asRecord, readJSON, readText, writeJSON } from './saved';

function fakeStorage(fail = false) {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (fail) throw new Error('bloqueado');
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('sin espacio');
      data.set(key, value);
    },
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('lo guardado en el navegador', () => {
  it('guarda y lee JSON', () => {
    fakeStorage();
    expect(writeJSON('a', { x: 1 })).toBe(true);
    expect(readJSON('a')).toEqual({ x: 1 });
    expect(readJSON('nada')).toBeNull();
  });

  it('lo que no es JSON se lee como nada', () => {
    fakeStorage().set('roto', '{no es json');
    expect(readJSON('roto')).toBeNull();
  });

  it('sin almacenamiento no rompe nada', () => {
    fakeStorage(true);
    expect(readText('a')).toBeNull();
    expect(writeJSON('a', 1)).toBe(false);
  });

  it('asRecord da un objeto vacío si no hay objeto', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(3)).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });
});
