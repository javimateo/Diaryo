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

/** Cambio de estilo desde el panel (a la selección o al texto que se escribe). */
export interface StylePatch {
  /** Color de trazos, textos y figuras (null = figura sin borde). */
  color?: Color | null;
  /** Color de fondo de las notas. */
  noteColor?: NoteFill;
  /** Estilo del post-it. */
  noteVariant?: NoteVariant;
  /** Color del texto de las notas (null = automático). */
  noteTextColor?: Color | null;
  /** Grosor (trazos y figuras) o tamaño de letra (textos y notas), en px de pantalla. */
  size?: number;
  /** Puntas de las flechas. */
  startHead?: ArrowHead;
  endHead?: ArrowHead;
  /** Tamaño de letra del texto dentro de figuras, en px de pantalla. */
  labelSize?: number;
  /** Fondo de figuras y trazos cerrados (null = sin fondo). */
  fill?: NoteFill | null;
  fillStyle?: FillStyle;
  roughness?: Roughness;
  font?: string;
  align?: TextAlign;
  valign?: VerticalAlign;
  opacity?: number;
}

/**
 * Aplica un cambio de estilo a un elemento. Solo toca lo que tiene sentido para su
 * tipo (una imagen solo cambia de opacidad) y reajusta la caja si cambia la letra.
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
        // El fondo solo tiene sentido en trazos cerrados.
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
        // Elegir un color devuelve el borde; "sin borde" lo quita.
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
 * Clave para fundir cambios seguidos en el historial: arrastrar un deslizador o el
 * selector de color produce muchos cambios que se deshacen de una vez.
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
