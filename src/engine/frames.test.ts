import { describe, expect, it } from 'vitest';
import type { ImageElement } from './elements';
import { coverCrop, heightForPhoto, photoArea } from './frames';
import { applyStyle } from './restyle';

describe('photo frames', () => {
  it('without a frame the photo takes the whole box', () => {
    expect(photoArea(200, 100)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('a polaroid leaves margins, wider at the bottom, inside the same box', () => {
    const area = photoArea(100, 120, 'polaroid');
    expect(area.x).toBeCloseTo(6);
    expect(area.y).toBeCloseTo(6);
    expect(area.width).toBeCloseTo(88);
    // Top margin 6, bottom 20.
    expect(area.height).toBeCloseTo(120 - 6 - 20);
  });

  it('the photo is cropped to fill its place, never stretched', () => {
    // A wide photo in a square place: its sides are cropped.
    const crop = coverCrop(400, 200, { x: 0, y: 0, width: 100, height: 100 });
    expect(crop).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    // Already the same proportions: all of it.
    expect(coverCrop(200, 100, { x: 0, y: 0, width: 50, height: 25 })).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it('are put on and taken off from the panel, with the shadow apart', () => {
    const photo: ImageElement = {
      id: 'i',
      type: 'image',
      z: 1,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      groupId: null,
      locked: false,
      assetId: 'a',
      width: 100,
      height: 120,
    };
    const framed = applyStyle(photo, { frame: 'polaroid', shadow: true }, 1);
    expect(framed).toMatchObject({ frame: 'polaroid', shadow: true, width: 100 });
    const bare = applyStyle(framed, { frame: 'none' }, 1);
    expect(bare.frame).toBeUndefined();
    expect(bare.shadow).toBe(true);
    expect(applyStyle(bare, { shadow: false }, 1).shadow).toBeUndefined();
  });

  it('adapt to the photo: it keeps its proportions, the box changes height', () => {
    const area = photoArea(100, heightForPhoto(100, 4 / 3, 'polaroid'), 'polaroid');
    expect(area.width / area.height).toBeCloseTo(4 / 3, 3);
    // Taking the frame off gives the photo's own shape back.
    expect(heightForPhoto(100, 4 / 3)).toBeCloseTo(75);
  });
});
