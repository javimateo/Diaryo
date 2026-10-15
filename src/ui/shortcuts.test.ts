import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { SHORTCUTS, keysOf } from './shortcuts';
import { TOOLS } from './toolDefs';

describe('the shortcuts table', () => {
  it('names the keys in the language shown', () => {
    expect(keysOf('today', es)).toEqual([['Ctrl', es.keys.home]]);
    expect(keysOf('today', en)).toEqual([['Ctrl', en.keys.home]]);
    expect(keysOf('redo', es)).toEqual([
      ['Ctrl', 'Shift', 'Z'],
      ['Ctrl', 'Y'],
    ]);
  });

  it('no combination is used twice, nor taken from a tool', () => {
    const all = Object.values(SHORTCUTS).flatMap((combos) =>
      combos.map((combo) => JSON.stringify(combo)),
    );
    expect(new Set(all).size).toBe(all.length);
    const tools = TOOLS.map((tool) => JSON.stringify([tool.key.toUpperCase()]));
    expect(all.filter((combo) => tools.includes(combo))).toEqual([]);
  });
});
