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

describe('what is saved in the browser', () => {
  it('saves and reads JSON', () => {
    fakeStorage();
    expect(writeJSON('a', { x: 1 })).toBe(true);
    expect(readJSON('a')).toEqual({ x: 1 });
    expect(readJSON('nada')).toBeNull();
  });

  it("what isn't JSON reads as nothing", () => {
    fakeStorage().set('roto', '{no es json');
    expect(readJSON('roto')).toBeNull();
  });

  it('without storage nothing breaks', () => {
    fakeStorage(true);
    expect(readText('a')).toBeNull();
    expect(writeJSON('a', 1)).toBe(false);
  });

  it('asRecord gives an empty object if there is no object', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(3)).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });
});
