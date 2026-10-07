import { describe, expect, it } from 'vitest';
import { parseElement } from './clipboard';
import { concealNote, type NoteElement } from './elements';

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
