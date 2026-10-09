import type {
  ArrowBinding,
  ArrowElement,
  ArrowHead,
  FillStyle,
  ImageElement,
  Label,
  NoteElement,
  Roughness,
  SceneElement,
  ShapeElement,
  StrokeElement,
  TextAlign,
  TextElement,
  VerticalAlign,
} from './elements';
import { DEFAULT_FONT } from './fonts';
import { NOTE_VARIANTS, type NoteVariant } from './notes';
import { isColor, isNoteFill } from './palette';

/** Marker to recognize what was copied from diaryo when pasting. */
const CLIPBOARD_TYPE = 'diaryo/elements';

export interface ClipboardContent {
  elements: SceneElement[];
  /** Images used by the elements: id → data URL. */
  assets: Record<string, string>;
}

export function serializeElements(content: ClipboardContent): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, ...content });
}

type Raw = Record<string, unknown>;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0;

function base(v: Raw) {
  if (!isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return null;
  return {
    id: String(v.id ?? ''),
    z: isFiniteNumber(v.z) ? v.z : 0,
    x: v.x,
    y: v.y,
    rotation: isFiniteNumber(v.rotation) ? v.rotation : 0,
    opacity: isFiniteNumber(v.opacity) ? Math.min(1, Math.max(0, v.opacity)) : 1,
    groupId: typeof v.groupId === 'string' ? v.groupId : null,
    locked: v.locked === true,
    link: typeof v.link === 'string' ? v.link : null,
  };
}

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const VALIGNS: VerticalAlign[] = ['top', 'middle', 'bottom'];

/** Text properties, with defaults for what older versions copied. */
function textProps(v: Raw) {
  return {
    font: typeof v.font === 'string' ? v.font : DEFAULT_FONT,
    align: ALIGNS.includes(v.align as TextAlign) ? (v.align as TextAlign) : 'left',
    ...(v.bold === true && { bold: true }),
    ...(v.italic === true && { italic: true }),
    ...(v.underline === true && { underline: true }),
  };
}

function parseStroke(v: Raw): StrokeElement | null {
  const b = base(v);
  const points = v.points;
  if (!b || (v.kind !== 'pen' && v.kind !== 'marker')) return null;
  if (!isColor(v.color) || !isPositive(v.size)) return null;
  if (!Array.isArray(points) || points.length < 3 || points.length % 3 !== 0) return null;
  if (!points.every(isFiniteNumber)) return null;
  return {
    ...b,
    type: 'stroke',
    kind: v.kind,
    points: [...points],
    simulatePressure: v.simulatePressure !== false,
    color: v.color,
    size: v.size,
    ...fillProps(v),
    label: parseLabel(v.label),
  };
}

function parseBinding(value: unknown): ArrowBinding | null {
  const v = value as Raw | null;
  const focus = v?.focus as Raw | undefined;
  if (!v || typeof v.elementId !== 'string' || !focus) return null;
  if (!isFiniteNumber(focus.x) || !isFiniteNumber(focus.y)) return null;
  return { elementId: v.elementId, focus: { x: focus.x, y: focus.y } };
}

const head = (v: unknown, fallback: ArrowHead): ArrowHead =>
  v === 'none' || v === 'arrow' ? v : fallback;

function parseArrow(v: Raw): ArrowElement | null {
  const b = base(v);
  const points = v.points;
  if (!b || !isColor(v.color) || !isPositive(v.size)) return null;
  if (!Array.isArray(points) || points.length !== 6 || !points.every(isFiniteNumber)) return null;
  return {
    ...b,
    rotation: 0,
    type: 'arrow',
    points: [...points],
    bend: isFiniteNumber(v.bend) ? v.bend : 0,
    start: parseBinding(v.start),
    end: parseBinding(v.end),
    color: v.color,
    size: v.size,
    roughness: [0, 1, 2].includes(v.roughness as number) ? (v.roughness as Roughness) : 1,
    seed: isFiniteNumber(v.seed) ? v.seed : 1,
    startHead: head(v.startHead, 'none'),
    endHead: head(v.endHead, 'arrow'),
  };
}

const FILL_STYLES: FillStyle[] = ['solid', 'hachure', 'cross-hatch', 'dots', 'zigzag'];

function fillProps(v: Raw) {
  return {
    fill: isNoteFill(v.fill) ? v.fill : null,
    fillStyle: FILL_STYLES.includes(v.fillStyle as FillStyle)
      ? (v.fillStyle as FillStyle)
      : 'solid',
  };
}

function parseLabel(value: unknown): Label | null {
  const v = value as Raw | null;
  if (!v || typeof v.text !== 'string' || !isPositive(v.fontSize)) return null;
  return {
    ...textProps(v),
    text: v.text,
    fontSize: v.fontSize,
    valign: VALIGNS.includes(v.valign as VerticalAlign) ? (v.valign as VerticalAlign) : 'middle',
  };
}

function parseShape(v: Raw): ShapeElement | null {
  const b = parseBox(v);
  if (!b || (v.shape !== 'rect' && v.shape !== 'ellipse')) return null;
  if (!isColor(v.color) || !isPositive(v.strokeWidth)) return null;
  return {
    ...b,
    type: 'shape',
    shape: v.shape,
    color: v.color,
    border: v.border !== false,
    strokeWidth: v.strokeWidth,
    roughness: [0, 1, 2].includes(v.roughness as number) ? (v.roughness as Roughness) : 1,
    seed: isFiniteNumber(v.seed) ? v.seed : 1,
    ...fillProps(v),
    label: parseLabel(v.label),
  };
}

function parseBox(v: Raw) {
  const b = base(v);
  if (!b || !isPositive(v.width) || !isPositive(v.height)) return null;
  return { ...b, width: v.width, height: v.height };
}

function parseText(v: Raw): TextElement | null {
  const b = parseBox(v);
  if (!b || typeof v.text !== 'string' || !isPositive(v.fontSize)) return null;
  if (!isColor(v.color)) return null;
  return {
    ...b,
    ...textProps(v),
    type: 'text',
    text: v.text,
    fontSize: v.fontSize,
    color: v.color,
    wrap: v.wrap === true,
  };
}

function parseNote(v: Raw): NoteElement | null {
  const b = parseBox(v);
  if (!b || typeof v.text !== 'string' || !isPositive(v.fontSize)) return null;
  if (!isNoteFill(v.color)) return null;
  return {
    ...b,
    ...textProps(v),
    type: 'note',
    text: v.text,
    fontSize: v.fontSize,
    variant: NOTE_VARIANTS.includes(v.variant as NoteVariant)
      ? (v.variant as NoteVariant)
      : 'plain',
    color: v.color,
    textColor: isColor(v.textColor) ? v.textColor : null,
    valign: VALIGNS.includes(v.valign as VerticalAlign) ? (v.valign as VerticalAlign) : 'top',
    ...privacy(v),
  };
}

/** A private note keeps its mark, and its encrypted text where it can't be read. */
function privacy(v: Raw): Partial<NoteElement> {
  if (v.private !== true) return {};
  if (v.concealed !== true) return { private: true };
  return typeof v.box === 'string'
    ? { private: true, concealed: true, box: v.box, text: '', link: null }
    : {};
}

function parseImage(v: Raw, hasAsset: (id: string) => boolean): ImageElement | null {
  const b = parseBox(v);
  if (!b || typeof v.assetId !== 'string' || !hasAsset(v.assetId)) return null;
  return { ...b, type: 'image', assetId: v.assetId };
}

function parseAssets(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object') return result;
  for (const [id, src] of Object.entries(value)) {
    if (typeof src === 'string' && src.startsWith('data:image/')) result[id] = src;
  }
  return result;
}

/**
 * Validates an element read from outside (clipboard, file, database). Fills in whatever
 * is missing with defaults and returns null if it can't be understood.
 */
export function parseElement(raw: unknown, hasAsset: (id: string) => boolean): SceneElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Raw;
  switch (v.type) {
    case 'stroke':
      return parseStroke(v);
    case 'text':
      return parseText(v);
    case 'note':
      return parseNote(v);
    case 'image':
      return parseImage(v, hasAsset);
    case 'shape':
      return parseShape(v);
    case 'arrow':
      return parseArrow(v);
    default:
      return null;
  }
}

/** Reads what was copied from diaryo. Returns null if the text is something else. */
export function parseElements(text: string): ClipboardContent | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const payload = data as { type?: unknown; elements?: unknown; assets?: unknown } | null;
  if (payload?.type !== CLIPBOARD_TYPE || !Array.isArray(payload.elements)) return null;
  const assets = parseAssets(payload.assets);

  // Elements that can't be understood are ignored (e.g. from a newer version).
  const elements: SceneElement[] = [];
  for (const raw of payload.elements as unknown[]) {
    const el = parseElement(raw, (id) => id in assets);
    if (el) elements.push(el);
  }
  return elements.length > 0 ? { elements, assets } : null;
}
