import { describe, expect, it } from 'vitest';
import { CLOSED_COVER } from './book';
import { COVER_TEMPLATES, coverTemplate } from './coverTemplates';
import { elementBounds } from './elements';

const texts = { engraved: 'Mi diario', gilded: 'Recuerdos', label: 'Apuntes', chalk: 'Viajes' };

describe('cover templates', () => {
  it('the blank one leaves the cover empty', () => {
    expect(coverTemplate('blank', texts, 2026)).toEqual([]);
  });

  it('everything fits on the cover, left of the elastic', () => {
    for (const template of COVER_TEMPLATES) {
      for (const el of coverTemplate(template, texts, 2026)) {
        const b = elementBounds(el);
        expect(b.minX).toBeGreaterThan(CLOSED_COVER.minX);
        expect(b.maxX).toBeLessThan(CLOSED_COVER.maxX - 40);
        expect(b.minY).toBeGreaterThan(CLOSED_COVER.minY);
        expect(b.maxY).toBeLessThan(CLOSED_COVER.maxY);
      }
    }
  });

  it('writes its words and the year, with new ids each time', () => {
    const chalk = coverTemplate('chalk', texts, 2026);
    const words = chalk.flatMap((el) => (el.type === 'text' ? [el.text] : []));
    expect(words).toEqual(['Viajes', '2026']);
    const again = coverTemplate('chalk', texts, 2026);
    expect(again.map((el) => el.id)).not.toEqual(chalk.map((el) => el.id));
  });
});
