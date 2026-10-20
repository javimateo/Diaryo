import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_STYLE } from '../engine/book';
import { elementBounds } from '../engine/elements';
import { es } from '../i18n/es';
import { featureClip, type FeatureScene } from './featureScenes';
import type { TourSceneContext } from './tourScenes';

const context: TourSceneContext = {
  texts: es.tour.scenes,
  style: DEFAULT_BOOK_STYLE,
  labels: es.book,
  language: 'es',
  today: '2026-10-20',
};

const scenes: FeatureScene[] = ['draw', 'turn', 'tasks', 'style', 'cover', 'private'];

describe('feature scenes', () => {
  it('every one ends with something to see, framed whole', () => {
    for (const scene of scenes) {
      const clip = featureClip(scene, context);
      const end = clip.frame(clip.duration);
      expect(end.elements.length, scene).toBeGreaterThan(0);
      for (const el of end.elements) {
        const b = elementBounds(el);
        const { bounds } = clip;
        const inside =
          b.minX >= bounds.minX &&
          b.maxX <= bounds.maxX &&
          b.minY >= bounds.minY &&
          b.maxY <= bounds.maxY;
        expect(inside, `${scene}: ${el.id}`).toBe(true);
      }
    }
  });

  it('the same element keeps its id from frame to frame (nothing is redrawn as new)', () => {
    for (const scene of scenes) {
      const clip = featureClip(scene, context);
      const ids = (t: number) => clip.frame(t).elements.map((el) => el.id);
      expect(ids(clip.duration), scene).toEqual(ids(clip.duration + 1000));
    }
  });

  it('the cover is drawn on the closed diary', () => {
    const clip = featureClip('cover', context);
    expect(clip.frame(clip.duration).book?.closed).toBe(true);
  });

  it('the private note ends hidden', () => {
    const clip = featureClip('private', context);
    const note = clip.frame(clip.duration).elements.find((el) => el.type === 'note');
    expect(note).toMatchObject({ private: true, concealed: true, text: '' });
  });
});
