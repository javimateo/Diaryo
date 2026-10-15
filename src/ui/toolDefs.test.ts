import { describe, expect, it } from 'vitest';
import { TOOLS, findToolForKey } from './toolDefs';

const key = (key: string, code = '') => ({ key, code }) as KeyboardEvent;

describe("the tools' keys", () => {
  it('each tool has its own letter and digit', () => {
    const letters = TOOLS.map((tool) => tool.key);
    const digits = TOOLS.flatMap((tool) => (tool.digit ? [tool.digit] : []));
    expect(new Set(letters).size).toBe(letters.length);
    expect(new Set(digits).size).toBe(digits.length);
  });

  it('a letter (any case) or a digit (also on the numpad) picks the tool', () => {
    expect(findToolForKey(key('p'))?.id).toBe('pen');
    expect(findToolForKey(key('P'))?.id).toBe('pen');
    expect(findToolForKey(key('3', 'Digit3'))?.id).toBe('pen');
    expect(findToolForKey(key('3', 'Numpad3'))?.id).toBe('pen');
    expect(findToolForKey(key('q'))).toBeUndefined();
  });
});
