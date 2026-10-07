import { arrowLocalBounds } from './arrowGeometry';
import type { Bounds } from './geometry';
import { rotateVec, type Vec } from './math';
import { DEFAULT_FONT } from './fonts';
import type { NoteVariant } from './notes';
import type { Color, NoteFill } from './palette';

export type StrokeKind = 'pen' | 'marker';
/** What has an adjustable size in the panel: stroke width or font size. */
export type SizedKind = StrokeKind | 'text';

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** How a closed shape's fill is drawn (like in Excalidraw). */
export type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'dots' | 'zigzag';
export type ShapeKind = 'rect' | 'ellipse';
/** 0 = clean lines, 1 = hand-drawn, 2 = very hand-drawn. */
export type Roughness = 0 | 1 | 2;

/** Text inside a shape (the shape acts as a container). It uses the stroke color. */
export interface Label {
  text: string;
  /** In world units. */
  fontSize: number;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
}

export interface StrokeStyle {
  color: Color;
  /**
   * Stroke width (or font size) in screen pixels. When creating it is divided by the
   * zoom, so it looks the same on screen however far out or in you are: you can write
   * small from very close or giant titles from afar.
   */
  size: number;
  /** 0 (invisible) to 1 (opaque). */
  opacity: number;
}

export interface TextStyle extends StrokeStyle {
  font: string;
  align: TextAlign;
}

export interface NoteStyle {
  variant: NoteVariant;
  color: NoteFill;
  /** Text color; null = automatic dark ink. */
  textColor: Color | null;
  /** Font size in screen pixels. */
  size: number;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
  opacity: number;
}

/** Rectangle and ellipse share a style. */
export interface ShapeStyle {
  color: Color;
  border: boolean;
  /** Stroke width in screen pixels. */
  size: number;
  fill: NoteFill | null;
  fillStyle: FillStyle;
  roughness: Roughness;
  opacity: number;
  font: string;
  /** Font size of the text inside, in screen pixels. */
  labelSize: number;
  align: TextAlign;
  valign: VerticalAlign;
}

export type ArrowHead = 'none' | 'arrow';

export interface ArrowStyle {
  color: Color;
  /** Width in screen pixels. */
  size: number;
  roughness: Roughness;
  opacity: number;
  startHead: ArrowHead;
  endHead: ArrowHead;
}

export interface ToolStyles {
  pen: StrokeStyle;
  marker: StrokeStyle;
  text: TextStyle;
  note: NoteStyle;
  shape: ShapeStyle;
  arrow: ArrowStyle;
}

export const DEFAULT_STYLES: ToolStyles = {
  pen: { color: 'ink', size: 4, opacity: 1 },
  marker: { color: 'yellow', size: 20, opacity: 1 },
  text: { color: 'ink', size: 24, opacity: 1, font: DEFAULT_FONT, align: 'left' },
  note: {
    variant: 'plain',
    color: 'yellow',
    textColor: null,
    size: 20,
    font: DEFAULT_FONT,
    align: 'left',
    valign: 'top',
    opacity: 1,
  },
  shape: {
    color: 'ink',
    border: true,
    size: 2,
    fill: null,
    fillStyle: 'hachure',
    roughness: 1,
    opacity: 1,
    font: DEFAULT_FONT,
    labelSize: 20,
    align: 'center',
    valign: 'middle',
  },
  arrow: {
    color: 'ink',
    size: 2,
    roughness: 1,
    opacity: 1,
    startHead: 'none',
    endHead: 'arrow',
  },
};

export interface SizeRange {
  min: number;
  max: number;
  step: number;
  /** Quick sizes in the panel. */
  presets: number[];
}

export const SIZE_RANGES: Record<SizedKind, SizeRange> = {
  pen: { min: 1, max: 40, step: 0.5, presets: [2, 4, 8] },
  marker: { min: 4, max: 80, step: 1, presets: [12, 24, 40] },
  text: { min: 8, max: 160, step: 1, presets: [16, 24, 40] },
};

export function clampSize(kind: SizedKind, size: number): number {
  const { min, max, step } = SIZE_RANGES[kind];
  const snapped = Math.round(size / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/** Next size when pressing + or − (proportional steps: fine at small sizes). */
export function stepSize(kind: SizedKind, size: number, direction: 1 | -1): number {
  const { step } = SIZE_RANGES[kind];
  const next =
    direction > 0 ? Math.max(size * 1.2, size + step) : Math.min(size / 1.2, size - step);
  return clampSize(kind, next);
}

/** Size of a new note in screen pixels. */
export const NOTE_SIZE = 220;

interface BaseElement {
  id: string;
  /** Stacking order: higher = on top. */
  z: number;
  /** The element's origin in the world (top left corner for box elements). */
  x: number;
  y: number;
  /** Rotation in radians around the origin (x, y). */
  rotation: number;
  /** 0 (invisible) to 1 (opaque). */
  opacity: number;
  /** Group it belongs to: it is selected and moved together with the rest. */
  groupId: string | null;
  /** Locked: it can't be selected, moved or deleted until unlocked. */
  locked: boolean;
  /** Link to another diary page (its id): it carries a label that opens that page. */
  link?: string | null;
}

export interface StrokeElement extends BaseElement {
  type: 'stroke';
  kind: StrokeKind;
  /** Points relative to (x, y), flattened: [x0, y0, pressure0, x1, y1, pressure1, …]. */
  points: number[];
  /** With a mouse the pressure is simulated from the speed. */
  simulatePressure: boolean;
  color: Color;
  /** Width in world units. */
  size: number;
  /** Fill (only takes effect if the stroke is a closed shape). */
  fill: NoteFill | null;
  fillStyle: FillStyle;
  /** Text inside (only in closed strokes). */
  label: Label | null;
}

/** Box-shaped elements: they occupy [0, width] × [0, height] in their coordinates. */
interface BoxElement extends BaseElement {
  width: number;
  height: number;
}

export interface TextElement extends BoxElement {
  type: 'text';
  text: string;
  /** In world units. */
  fontSize: number;
  color: Color;
  font: string;
  align: TextAlign;
  /**
   * Fixed-width box: the text wraps at the edge and the box grows downwards. If false,
   * the box fits what is written (each line as long as it is).
   */
  wrap: boolean;
}

export interface NoteElement extends BoxElement {
  type: 'note';
  /** Sticky note style: plain, with a pin, tape, clip… */
  variant: NoteVariant;
  text: string;
  fontSize: number;
  color: NoteFill;
  /** Text color; null = automatic dark ink. */
  textColor: Color | null;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
  /**
   * Private: its text (and link) are encrypted apart and need the diary password to be
   * seen (docs/privacy.md). Where they can't be read, `concealed` is set, the text is
   * empty and `box` carries them encrypted, as they are.
   */
  private?: boolean;
  concealed?: boolean;
  box?: string;
}

/** A private note, as it shows where its text can't be seen (thumbnails, locked). */
export function concealNote(el: NoteElement): NoteElement {
  return { ...el, text: '', link: null, concealed: true };
}

export interface ImageElement extends BoxElement {
  type: 'image';
  /** Reference to the image in the asset store (shared between copies). */
  assetId: string;
}

export interface ShapeElement extends BoxElement {
  type: 'shape';
  shape: ShapeKind;
  /** Stroke color (and of the text inside). */
  color: Color;
  /** The border is drawn. Without a border, the shape is an invisible box (or only its fill). */
  border: boolean;
  /** Stroke width in world units. */
  strokeWidth: number;
  roughness: Roughness;
  /** Seed so the "hand-drawn" stroke is always the same. */
  seed: number;
  fill: NoteFill | null;
  fillStyle: FillStyle;
  label: Label | null;
}

/** Arrow end attached to another element. */
export interface ArrowBinding {
  elementId: string;
  /** Where it points inside the element (0 to 1 on each axis of its box; 0.5 = the center). */
  focus: Vec;
}

/**
 * Arrow between two points, straight or curved. Its ends can attach to other elements and
 * follow them when they move. It is never rotated: its points already are.
 */
export interface ArrowElement extends BaseElement {
  type: 'arrow';
  /** Start and end relative to (x, y), flattened like strokes: [x0, y0, 0, x1, y1, 0]. */
  points: number[];
  /** Curve: how far its middle moves away from the straight line (world units; 0 = straight). */
  bend: number;
  start: ArrowBinding | null;
  end: ArrowBinding | null;
  color: Color;
  /** Width in world units. */
  size: number;
  roughness: Roughness;
  seed: number;
  startHead: ArrowHead;
  endHead: ArrowHead;
}

export type SceneElement =
  StrokeElement | TextElement | NoteElement | ImageElement | ShapeElement | ArrowElement;
export type BoxSceneElement = TextElement | NoteElement | ImageElement | ShapeElement;
/** What can contain text (shapes and closed strokes). */
export type ContainerElement = ShapeElement | StrokeElement;
/** What can be opened in the text editor. */
export type EditableElement = TextElement | NoteElement | ContainerElement;

export const isBox = (el: SceneElement): el is BoxSceneElement =>
  el.type !== 'stroke' && el.type !== 'arrow';

/**
 * The element's box in its own coordinates (before rotating and moving), including the
 * stroke width.
 */
export function localBounds(el: SceneElement): Bounds {
  if (isBox(el)) return { minX: 0, minY: 0, maxX: el.width, maxY: el.height };
  if (el.type === 'arrow') return arrowLocalBounds(el);
  const { points, size } = el;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const px = points[i];
    const py = points[i + 1];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const pad = size / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Axis-aligned box that wraps the element in the world (already rotated). */
export function elementBounds(el: SceneElement): Bounds {
  const { x, y, rotation } = el;
  if (rotation === 0) {
    const b = localBounds(el);
    return { minX: b.minX + x, minY: b.minY + y, maxX: b.maxX + x, maxY: b.maxY + y };
  }
  // Rotated: the stroke's points are rotated (tighter) or the box corners.
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (lx: number, ly: number) => {
    const px = lx * cos - ly * sin;
    const py = lx * sin + ly * cos;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  let pad = 0;
  if (isBox(el)) {
    add(0, 0);
    add(el.width, 0);
    add(el.width, el.height);
    add(0, el.height);
  } else {
    for (let i = 0; i < el.points.length; i += 3) add(el.points[i], el.points[i + 1]);
    pad = el.size / 2;
  }
  return { minX: x + minX - pad, minY: y + minY - pad, maxX: x + maxX + pad, maxY: y + maxY + pad };
}

/** Converts a world point to the element's own coordinates. */
export function toLocal(el: SceneElement, p: Vec): Vec {
  return rotateVec({ x: p.x - el.x, y: p.y - el.y }, -el.rotation);
}

/** Converts a point from the element's coordinates to the world. */
export function toWorld(el: SceneElement, p: Vec): Vec {
  const r = rotateVec(p, el.rotation);
  return { x: r.x + el.x, y: r.y + el.y };
}

export function createId(): string {
  return crypto.randomUUID();
}
