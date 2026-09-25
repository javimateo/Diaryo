import { fitContainer, isClosedStroke } from './containers';
import { fitNote, fitText } from './editing';
import type {
  ArrowHead,
  FillStyle,
  Label,
  Roughness,
  SceneElement,
  TextAlign,
  VerticalAlign,
} from './elements';
import type { NoteVariant } from './notes';
import type { Color, NoteFill } from './palette';

/** Style change from the panel (to the selection or to the text being written). */
export interface StylePatch {
  /** Color of strokes, texts and shapes (null = shape without a border). */
  color?: Color | null;
  /** Note background color. */
  noteColor?: NoteFill;
  /** Sticky note style. */
  noteVariant?: NoteVariant;
  /** Note text color (null = automatic). */
  noteTextColor?: Color | null;
  /** Stroke width (strokes and shapes) or font size (texts and notes), in screen px. */
  size?: number;
  /** Arrowheads. */
  startHead?: ArrowHead;
  endHead?: ArrowHead;
  /** Font size of the text inside shapes, in screen px. */
  labelSize?: number;
  /** Fill of shapes and closed strokes (null = no fill). */
  fill?: NoteFill | null;
  fillStyle?: FillStyle;
  roughness?: Roughness;
  font?: string;
  align?: TextAlign;
  valign?: VerticalAlign;
  opacity?: number;
}

/**
 * Applies a style change to an element. It only touches what makes sense for its type (an
 * image only changes opacity) and refits the box if the font changes.
 */
export function applyStyle<T extends SceneElement>(element: T, patch: StylePatch, zoom: number): T {
  return restyle(element, patch, zoom) as T;
}

function restyle(el: SceneElement, patch: StylePatch, zoom: number): SceneElement {
  const world = patch.size === undefined ? undefined : patch.size / zoom;
  const opacity = patch.opacity ?? el.opacity;

  switch (el.type) {
    case 'stroke': {
      const closed = isClosedStroke(el);
      return {
        ...el,
        opacity,
        color: patch.color ?? el.color,
        size: world ?? el.size,
        // The fill only makes sense on closed strokes.
        fill: closed && patch.fill !== undefined ? patch.fill : el.fill,
        fillStyle: patch.fillStyle ?? el.fillStyle,
        label: restyleLabel(el.label, patch, zoom),
      };
    }
    case 'shape':
      return fitContainer({
        ...el,
        opacity,
        color: patch.color ?? el.color,
        // Choosing a color brings the border back; "no border" removes it.
        border: patch.color === undefined ? el.border : patch.color !== null,
        strokeWidth: world ?? el.strokeWidth,
        fill: patch.fill !== undefined ? patch.fill : el.fill,
        fillStyle: patch.fillStyle ?? el.fillStyle,
        roughness: patch.roughness ?? el.roughness,
        label: restyleLabel(el.label, patch, zoom),
      });
    case 'text': {
      const next = {
        ...el,
        opacity,
        color: patch.color ?? el.color,
        fontSize: world ?? el.fontSize,
        font: patch.font ?? el.font,
        align: patch.align ?? el.align,
      };
      return world !== undefined || patch.font ? fitText(next) : next;
    }
    case 'note':
      return fitNote({
        ...el,
        opacity,
        color: patch.noteColor ?? el.color,
        variant: patch.noteVariant ?? el.variant,
        textColor: patch.noteTextColor !== undefined ? patch.noteTextColor : el.textColor,
        fontSize: world ?? el.fontSize,
        font: patch.font ?? el.font,
        align: patch.align ?? el.align,
        valign: patch.valign ?? el.valign,
      });
    case 'image':
      return { ...el, opacity };
    case 'arrow':
      return {
        ...el,
        opacity,
        color: patch.color ?? el.color,
        size: world ?? el.size,
        roughness: patch.roughness ?? el.roughness,
        startHead: patch.startHead ?? el.startHead,
        endHead: patch.endHead ?? el.endHead,
      };
  }
}

function restyleLabel(label: Label | null, patch: StylePatch, zoom: number): Label | null {
  if (!label) return null;
  return {
    ...label,
    fontSize: patch.labelSize === undefined ? label.fontSize : patch.labelSize / zoom,
    font: patch.font ?? label.font,
    align: patch.align ?? label.align,
    valign: patch.valign ?? label.valign,
  };
}

/**
 * Key to merge consecutive changes in the history: dragging a slider or the color picker
 * produces many changes that are undone at once.
 */
export function patchMergeKey(patch: StylePatch): string | undefined {
  if (patch.size !== undefined) return 'restyle-size';
  if (patch.labelSize !== undefined) return 'restyle-label-size';
  if (patch.opacity !== undefined) return 'restyle-opacity';
  if (patch.color || patch.noteColor || patch.noteTextColor !== undefined || patch.fill) {
    return 'restyle-color';
  }
  return undefined;
}
