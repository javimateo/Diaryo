import { describe, expect, it } from 'vitest';
import { parseElements, serializeElements } from './clipboard';
import type { TextElement } from './elements';
import { applyStyle } from './restyle';
import { fontAt } from './text';

const text: TextElement = {
  id: 't',
  type: 'text',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  text: 'hola',
  fontSize: 20,
  color: 'ink',
  font: 'inter',
  align: 'left',
  wrap: false,
  width: 100,
  height: 25,
};

describe('bold, italic and underline', () => {
  it('make up the font the canvas draws with', () => {
    expect(fontAt(100, { font: 'inter' })).toMatch(/^400 100px /);
    expect(fontAt(100, { font: 'inter', bold: true, italic: true })).toMatch(/^italic 700 100px /);
  });

  it('are kept when read back, and anything that is not true is dropped', () => {
    const copied = serializeElements({
      elements: [{ ...text, bold: true, underline: true }],
      assets: {},
    });
    const [back] = parseElements(copied)!.elements as TextElement[];
    expect(back).toMatchObject({ bold: true, underline: true });
    expect(back.italic).toBeUndefined();

    const odd = copied.replace('"bold":true', '"bold":"yes"');
    expect((parseElements(odd)!.elements[0] as TextElement).bold).toBeUndefined();
  });

  it('turn on and off from the panel, the rest of the style untouched', () => {
    const underlined = applyStyle({ ...text, italic: true }, { underline: true }, 1);
    expect(underlined).toMatchObject({ italic: true, underline: true, font: 'inter' });
    const plain = applyStyle(underlined, { underline: false }, 1);
    expect(plain.underline).toBeUndefined();
    expect(plain.italic).toBe(true);
  });
});
