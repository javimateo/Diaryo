import { describe, expect, it } from 'vitest';
import { parseElements, serializeElements } from './clipboard';

const image = (assetId: string) => ({
  id: 'i1',
  type: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  assetId,
});

describe('parseElements', () => {
  it('keeps an image whose file came with it', () => {
    const text = serializeElements({
      elements: [image('a1')] as never,
      assets: { a1: 'data:image/png;base64,AAAA' },
    });
    expect(parseElements(text)?.elements).toHaveLength(1);
  });

  it("drops an image whose file didn't come, whatever its id is called", () => {
    for (const id of ['missing', 'toString', 'constructor', '__proto__']) {
      const text = serializeElements({ elements: [image(id)] as never, assets: {} });
      expect(parseElements(text)).toBeNull();
    }
  });
});
