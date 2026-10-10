import { CLOSED_COVER } from './book';
import {
  createId,
  type NoteElement,
  type SceneElement,
  type StrokeElement,
  type TextElement,
} from './elements';
import type { HexColor } from './palette';
import { LINE_HEIGHT } from './text';

export type CoverTemplate = 'blank' | 'engraved' | 'gilded' | 'label' | 'photos' | 'chalk';

/** The templates, in the order they are offered. */
export const COVER_TEMPLATES: CoverTemplate[] = [
  'blank',
  'engraved',
  'gilded',
  'label',
  'photos',
  'chalk',
];

/** The words each template writes (in the app's language). */
export interface CoverTemplateTexts {
  engraved: string;
  gilded: string;
  label: string;
  chalk: string;
}

/** A little left of the cover's middle: the elastic takes its right side. */
const CX = (CLOSED_COVER.minX + CLOSED_COVER.maxX) / 2 - 30;
const CY = (CLOSED_COVER.minY + CLOSED_COVER.maxY) / 2;
/** Width of the template texts (centered in it). */
const TEXT_WIDTH = 600;

const GOLD: HexColor = '#e6c87e';
const CHALK: HexColor = '#fbf3ea';
/** Pressed into the cover: dark and half transparent, so it takes the cover's color. */
const PRESSED: HexColor = '#000000';

const common = (z: number) => ({
  id: createId(),
  z,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
});

/** A line of centered text whose middle is at `cy`. */
function line(
  z: number,
  text: string,
  cy: number,
  style: Pick<TextElement, 'font' | 'fontSize' | 'color'> & Partial<TextElement>,
): TextElement {
  const height = style.fontSize * LINE_HEIGHT;
  return {
    ...common(z),
    type: 'text',
    text,
    align: 'center',
    wrap: true,
    x: CX - TEXT_WIDTH / 2,
    y: cy - height / 2,
    width: TEXT_WIDTH,
    height,
    ...style,
  };
}

/** A pen line through these points (of a 24-unit icon), `size` wide and centered at `cy`. */
function drawing(
  z: number,
  icon: [number, number][],
  cy: number,
  size: number,
  color: HexColor,
): StrokeElement {
  const k = size / 24;
  // Many close points, like a hand drawing it: with few, the pen rounds off the corners.
  const points = icon.flatMap(([x, y], i): [number, number][] => {
    const [nx, ny] = icon[i + 1] ?? [x, y];
    return Array.from({ length: i + 1 < icon.length ? 8 : 1 }, (_, j) => [
      x + ((nx - x) * j) / 8,
      y + ((ny - y) * j) / 8,
    ]);
  });
  return {
    ...common(z),
    type: 'stroke',
    kind: 'pen',
    x: CX - size / 2,
    y: cy - size / 2,
    points: points.flatMap(([x, y]) => [x * k, y * k, 0.5]),
    simulatePressure: false,
    color,
    size: 9,
    fill: null,
    fillStyle: 'solid',
    label: null,
  };
}

const arc = (cx: number, cy: number, r: number, from: number, to: number) =>
  Array.from({ length: 25 }, (_, i): [number, number] => {
    const a = ((from + ((to - from) * i) / 24) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** A crescent moon: the outer round and the bite taken out of it. */
const MOON = [...arc(12, 12, 9, 0, 270), ...arc(16.5, 7.5, 6.36, -135, -315)];
/** A mountain with two peaks. */
const MOUNTAIN: [number, number][] = [
  [8, 3],
  [12, 11],
  [17, 6],
  [22, 21],
  [2, 21],
  [8, 3],
];

/** An empty white card held with tape: the frame for a photo stuck on top. */
function frame(z: number, cx: number, cy: number, size: number, turn: number): NoteElement {
  return {
    ...common(z),
    type: 'note',
    variant: 'tape',
    x: cx - size / 2,
    y: cy - size / 2,
    width: size,
    height: size,
    rotation: (turn * Math.PI) / 180,
    text: '',
    fontSize: 40,
    color: '#fbf8f1',
    textColor: null,
    font: 'caveat',
    align: 'center',
    valign: 'middle',
  };
}

/**
 * What a template puts on the cover: plain elements, so everything can be changed after.
 * `year` goes under the title.
 */
export function coverTemplate(
  template: CoverTemplate,
  texts: CoverTemplateTexts,
  year: number,
): SceneElement[] {
  const y = String(year);
  switch (template) {
    case 'blank':
      return [];
    case 'engraved':
      return [
        line(1, texts.engraved, CY - 40, {
          font: 'lora',
          fontSize: 96,
          color: PRESSED,
          bold: true,
          opacity: 0.42,
        }),
        line(2, y, CY + 60, { font: 'nunito', fontSize: 40, color: PRESSED, opacity: 0.42 }),
      ];
    case 'gilded':
      return [
        drawing(1, MOON, CY - 130, 110, GOLD),
        line(2, texts.gilded, CY + 20, {
          font: 'playfair-display',
          fontSize: 92,
          color: GOLD,
          italic: true,
        }),
        line(3, y, CY + 110, { font: 'nunito', fontSize: 36, color: GOLD }),
      ];
    case 'label': {
      const card = frame(1, CX, CY - 40, 380, -2);
      return [
        { ...card, variant: 'plain', height: 230, y: CY - 155, color: '#f7f0e2' },
        line(2, texts.label, CY - 70, { font: 'caveat', fontSize: 100, color: '#2b2520' }),
        line(3, y, CY + 10, { font: 'nunito', fontSize: 32, color: '#7a6f63' }),
      ];
    }
    case 'photos':
      return [
        frame(1, CX - 110, CY - 170, 300, -5),
        frame(2, CX + 120, CY + 10, 280, 4),
        frame(3, CX - 90, CY + 230, 260, -2),
      ];
    case 'chalk':
      return [
        drawing(1, MOUNTAIN, CY - 120, 150, CHALK),
        line(2, texts.chalk, CY + 40, { font: 'caveat', fontSize: 130, color: CHALK }),
        line(3, y, CY + 140, { font: 'caveat', fontSize: 48, color: CHALK }),
      ];
  }
}
