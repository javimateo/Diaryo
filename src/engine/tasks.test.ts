import { describe, expect, it } from 'vitest';
// The checkboxes are placed by measuring the text, on a canvas.
import './testCanvas';
import type { TextElement } from './elements';
import { Scene } from './scene';
import { taskAt, taskUnder } from './tasks';

const text = (id: string, z: number, value: string): TextElement => ({
  id,
  type: 'text',
  z,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  text: value,
  fontSize: 20,
  color: 'ink',
  font: 'inter',
  align: 'left',
  wrap: false,
  width: 200,
  height: 40,
});

/** A point on the first checkbox of this text. */
function boxOf(el: TextElement) {
  for (let x = 0; x < el.width; x++) {
    for (let y = 0; y < el.height; y++) if (taskAt(el, { x, y }, 0) !== null) return { x, y };
  }
  throw new Error('no checkbox');
}

describe('the checkbox under the pointer', () => {
  it('finds the task of the topmost element there', () => {
    const below = text('a', 1, '[ ] pan');
    const above = text('b', 2, '[x] leche');
    const scene = new Scene();
    scene.apply(new Map([below, above].map((el) => [el.id, el])));
    expect(taskUnder(scene, boxOf(below), 0)).toEqual({ el: above, paragraph: 0 });
  });

  it('nothing where there is no checkbox', () => {
    const scene = new Scene();
    scene.apply(new Map([['a', text('a', 1, 'pan')]]));
    expect(taskUnder(scene, { x: 5, y: 10 }, 0)).toBeNull();
    expect(taskUnder(scene, { x: 500, y: 500 }, 0)).toBeNull();
  });
});
