import { describe, expect, it } from 'vitest';
import { parseElement } from './clipboard';
import { concealNote, isLocked, privateBadge, type NoteElement } from './elements';
import { Scene } from './scene';
import { elementsInRect, hitTestElement } from './selection';

const note: NoteElement = {
  id: 'n',
  type: 'note',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  link: 'p2',
  text: 'pin 4321',
  fontSize: 20,
  variant: 'plain',
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
  width: 220,
  height: 220,
  private: true,
};

describe('private notes', () => {
  it('keep their mark when read, and a hidden one keeps its encrypted text', () => {
    expect(parseElement(note, () => true)).toMatchObject({ private: true, text: 'pin 4321' });
    const hidden = { ...concealNote(note), box: 'Y2lmcmFkbw==' };
    expect(hidden).toMatchObject({ text: '', link: null, concealed: true });
    expect(parseElement(hidden, () => true)).toMatchObject({
      private: true,
      concealed: true,
      box: 'Y2lmcmFkbw==',
      text: '',
    });
  });

  it("a hidden one without its encrypted text isn't private any more (nothing to open)", () => {
    const broken = { ...concealNote(note) };
    expect(parseElement(broken, () => true)).not.toHaveProperty('private');
  });
});

describe('a hidden private note', () => {
  it('counts as locked: not hit, not boxed, but its menu reaches it', () => {
    const hidden = { ...concealNote(note), box: 'Y2lmcmFkbw==' };
    expect(isLocked(hidden)).toBe(true);
    expect(isLocked(note)).toBe(false);
    const scene = new Scene();
    scene.apply(new Map([[hidden.id, hidden]]));
    const center = { x: 110, y: 110 };
    expect(hitTestElement(scene, center, 1)).toBeNull();
    expect(hitTestElement(scene, center, 1, true)?.id).toBe('n');
    expect(elementsInRect(scene, { minX: -10, minY: -10, maxX: 300, maxY: 300 })).toEqual([]);
  });

  it('shown, has its open padlock in the corner', () => {
    const badge = privateBadge(note);
    expect(badge.x).toBeGreaterThan(note.width / 2);
    expect(badge.y).toBeGreaterThan(note.height / 2);
    expect(badge.x + badge.r).toBeLessThan(note.width);
  });
});
