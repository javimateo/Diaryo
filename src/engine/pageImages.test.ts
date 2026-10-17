import { describe, expect, it } from 'vitest';
import { drawnTexts } from './testCanvas';
import { AssetStore } from './assets';
import { DEFAULT_BOOK_STYLE, type BookSpread } from './book';
import type { NoteElement } from './elements';
import { concealPrivate, pageThumbnail } from './pageImages';

const note = (id: string, more: Partial<NoteElement> = {}): NoteElement => ({
  id,
  type: 'note',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  variant: 'plain',
  text: 'hola',
  fontSize: 20,
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
  width: 220,
  height: 220,
  ...more,
});

const book: BookSpread = {
  style: DEFAULT_BOOK_STYLE,
  date: 'sábado',
  title: '',
  today: false,
  pageNumber: 1,
  tabs: [],
  labels: { today: '', cues: '', notes: '', summary: '', tasks: '' },
};

describe('images of pages', () => {
  it('hide the text of private notes and leave the rest as it is', () => {
    const plain = note('n');
    const [shown, secret] = concealPrivate([plain, note('p', { private: true, text: 'pin' })]);
    expect(shown).toBe(plain);
    expect(secret).toMatchObject({ concealed: true, text: '' });
  });

  it('a thumbnail of each kind of page draws the notes but not a private one', () => {
    const elements = [note('n', { z: 2 }), note('p', { private: true, text: 'pin 4321' })];
    for (const spread of [null, book, { ...book, closed: true }]) {
      drawnTexts.length = 0;
      const size = { width: 200, height: 150 };
      expect(pageThumbnail(elements, spread, size, 'dark', new AssetStore(() => {}))).toBeTruthy();
      expect(drawnTexts.join(' ')).toContain('hola');
      expect(drawnTexts.join(' ')).not.toContain('4321');
      // The open diary's, as a double page: its paper with the date.
      expect(drawnTexts.includes('sábado')).toBe(spread === book);
    }
  });
});
