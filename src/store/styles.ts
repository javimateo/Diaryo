import {
  clampSize,
  DEFAULT_STYLES,
  type ArrowHead,
  type ArrowStyle,
  type FillStyle,
  type NoteStyle,
  type Roughness,
  type ShapeStyle,
  type SizedKind,
  type StrokeStyle,
  type TextAlign,
  type TextStyle,
  type ToolStyles,
  type VerticalAlign,
} from '../engine/elements';
import { fonts } from '../engine/fonts';
import { NOTE_VARIANTS, type NoteVariant } from '../engine/notes';
import { isColor, isHexColor, isNoteFill, type HexColor } from '../engine/palette';

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const VALIGNS: VerticalAlign[] = ['top', 'middle', 'bottom'];

type Raw = Record<string, unknown> | undefined;

const opacityOf = (raw: Raw, fallback: number) =>
  typeof raw?.opacity === 'number' ? Math.min(1, Math.max(0, raw.opacity)) : fallback;

const sizeOf = (raw: Raw, kind: SizedKind, fallback: number) =>
  typeof raw?.size === 'number' && Number.isFinite(raw.size) ? clampSize(kind, raw.size) : fallback;

// Uploaded fonts aren't registered yet at startup: they are accepted anyway and, if they
// don't show up, the default font is used.
const fontOf = (raw: Raw, fallback: string) =>
  typeof raw?.font === 'string' && (fonts.has(raw.font) || raw.font.startsWith('custom-'))
    ? raw.font
    : fallback;

function strokeStyle(kind: 'pen' | 'marker', raw: Raw): StrokeStyle {
  const d = DEFAULT_STYLES[kind];
  return {
    color: isColor(raw?.color) ? raw.color : d.color,
    size: sizeOf(raw, kind, d.size),
    opacity: opacityOf(raw, d.opacity),
  };
}

function textStyle(raw: Raw): TextStyle {
  const d = DEFAULT_STYLES.text;
  return {
    color: isColor(raw?.color) ? raw.color : d.color,
    size: sizeOf(raw, 'text', d.size),
    opacity: opacityOf(raw, d.opacity),
    font: fontOf(raw, d.font),
    align: ALIGNS.includes(raw?.align as TextAlign) ? (raw!.align as TextAlign) : d.align,
  };
}

function noteStyle(raw: Raw): NoteStyle {
  const d = DEFAULT_STYLES.note;
  return {
    variant: NOTE_VARIANTS.includes(raw?.variant as NoteVariant)
      ? (raw!.variant as NoteVariant)
      : d.variant,
    color: isNoteFill(raw?.color) ? raw.color : d.color,
    textColor: isColor(raw?.textColor) ? raw.textColor : null,
    size: sizeOf(raw, 'text', d.size),
    font: fontOf(raw, d.font),
    align: ALIGNS.includes(raw?.align as TextAlign) ? (raw!.align as TextAlign) : d.align,
    valign: VALIGNS.includes(raw?.valign as VerticalAlign)
      ? (raw!.valign as VerticalAlign)
      : d.valign,
    opacity: opacityOf(raw, d.opacity),
  };
}

const FILL_STYLES: FillStyle[] = ['solid', 'hachure', 'cross-hatch', 'dots', 'zigzag'];

const HEADS = ['none', 'arrow'];

function arrowStyle(raw: Raw): ArrowStyle {
  const d = DEFAULT_STYLES.arrow;
  return {
    color: isColor(raw?.color) ? raw.color : d.color,
    size: sizeOf(raw, 'pen', d.size),
    roughness: [0, 1, 2].includes(raw?.roughness as number)
      ? (raw!.roughness as Roughness)
      : d.roughness,
    opacity: opacityOf(raw, d.opacity),
    startHead: HEADS.includes(raw?.startHead as string)
      ? (raw!.startHead as ArrowHead)
      : d.startHead,
    endHead: HEADS.includes(raw?.endHead as string) ? (raw!.endHead as ArrowHead) : d.endHead,
  };
}

function shapeStyle(raw: Raw): ShapeStyle {
  const d = DEFAULT_STYLES.shape;
  return {
    color: isColor(raw?.color) ? raw.color : d.color,
    border: raw?.border !== false,
    size: sizeOf(raw, 'pen', d.size),
    fill: raw?.fill === null || isNoteFill(raw?.fill) ? (raw!.fill as ShapeStyle['fill']) : d.fill,
    fillStyle: FILL_STYLES.includes(raw?.fillStyle as FillStyle)
      ? (raw!.fillStyle as FillStyle)
      : d.fillStyle,
    roughness: [0, 1, 2].includes(raw?.roughness as number)
      ? (raw!.roughness as Roughness)
      : d.roughness,
    opacity: opacityOf(raw, d.opacity),
    font: fontOf(raw, d.font),
    labelSize: typeof raw?.labelSize === 'number' ? clampSize('text', raw.labelSize) : d.labelSize,
    align: ALIGNS.includes(raw?.align as TextAlign) ? (raw!.align as TextAlign) : d.align,
    valign: VALIGNS.includes(raw?.valign as VerticalAlign)
      ? (raw!.valign as VerticalAlign)
      : d.valign,
  };
}

/** Reads the saved styles, fixing whatever is missing or invalid. */
export function parseStyles(json: string | null): ToolStyles {
  try {
    const saved = JSON.parse(json ?? 'null') as Record<string, Raw> | null;
    return {
      pen: strokeStyle('pen', saved?.pen),
      marker: strokeStyle('marker', saved?.marker),
      text: textStyle(saved?.text),
      note: noteStyle(saved?.note),
      shape: shapeStyle(saved?.shape),
      arrow: arrowStyle(saved?.arrow),
    };
  } catch {
    return DEFAULT_STYLES;
  }
}

/** Which size range each tool uses. */
export const SIZE_KIND: Record<keyof ToolStyles, SizedKind> = {
  pen: 'pen',
  marker: 'marker',
  text: 'text',
  note: 'text',
  shape: 'pen',
  arrow: 'pen',
};

export function mergeToolStyle<K extends keyof ToolStyles>(
  styles: ToolStyles,
  tool: K,
  patch: Partial<ToolStyles[K]>,
): ToolStyles {
  const next = { ...styles[tool], ...patch };
  next.size = clampSize(SIZE_KIND[tool], next.size);
  return { ...styles, [tool]: next };
}

/** Custom colors used recently (most recent first). */
export const RECENT_COLORS_LIMIT = 8;

export function parseRecentColors(json: string | null): HexColor[] {
  try {
    const list = JSON.parse(json ?? '[]');
    return Array.isArray(list) ? list.filter(isHexColor).slice(0, RECENT_COLORS_LIMIT) : [];
  } catch {
    return [];
  }
}
