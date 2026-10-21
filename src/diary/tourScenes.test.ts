import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_STYLE } from '../engine/book';
import { elementBounds } from '../engine/elements';
import type { Bounds } from '../engine/geometry';
import { es } from '../i18n/es';
import { tourClip, type TourSceneContext, type TourStep } from './tourScenes';

const context: TourSceneContext = {
  texts: es.tour.scenes,
  style: DEFAULT_BOOK_STYLE,
  labels: es.book,
  language: 'es',
  today: '2026-10-20',
};

const steps = Object.keys(es.tour.steps) as TourStep[];

const inside = (b: Bounds, frame: Bounds) =>
  b.minX >= frame.minX && b.maxX <= frame.maxX && b.minY >= frame.minY && b.maxY <= frame.maxY;

describe('tour scenes', () => {
  it('every step ends with something to see, framed whole', () => {
    for (const step of steps) {
      const clip = tourClip(step, context);
      const end = clip.frame(clip.duration);
      expect(end.book, step).not.toBeNull();
      expect(end.elements.length, step).toBeGreaterThan(0);
      for (const el of end.elements)
        expect(inside(elementBounds(el), clip.bounds), el.id).toBe(true);
    }
  });

  it('starts empty and ends written', () => {
    const clip = tourClip('tools', context);
    expect(clip.frame(0).elements).toEqual([]);
    expect(clip.frame(clip.duration).elements).toHaveLength(4);
  });

  it('turns to today, with the note still on the desk', () => {
    const clip = tourClip('desk', context);
    const [turn] = clip.turns!;
    const before = clip.frame(turn.at);
    const after = clip.frame(turn.at + turn.duration);
    expect(before.book!.today).toBe(false);
    expect(after.book!.today).toBe(true);
    expect(after.desk).toEqual(before.desk);
    expect(after.elements.map((el) => el.id)).toContain(before.desk![0]);
  });

  it('the task ends with its date, and the other one ticked', () => {
    const clip = tourClip('upcoming', context);
    const texts = clip
      .frame(clip.duration)
      .elements.map((el) => (el.type === 'text' ? el.text : ''));
    expect(texts[0]).toMatch(/^\[x\]/);
    expect(texts[1]).toContain('@');
  });

  it('the book tries other looks and ends as the user has it', () => {
    const clip = tourClip('settings', context);
    expect(clip.frame(0).book!.style.cover).not.toBe(DEFAULT_BOOK_STYLE.cover);
    expect(clip.frame(clip.duration).book!.style).toBe(DEFAULT_BOOK_STYLE);
  });
});
