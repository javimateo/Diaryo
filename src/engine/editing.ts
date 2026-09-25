import {
  createId,
  NOTE_SIZE,
  type EditableElement,
  type NoteElement,
  type SceneElement,
  type TextElement,
  type ToolStyles,
} from './elements';
import { fitContainer, isClosedStroke } from './containers';
import type { Vec } from './math';
import { notePadding } from './render';
import { layoutText, LINE_HEIGHT } from './text';

/** ¿Se puede escribir en él? Textos, notas, figuras y trazos cerrados. */
export function isEditable(el: SceneElement): el is EditableElement {
  if (el.type === 'stroke') return isClosedStroke(el);
  return el.type !== 'image';
}

/** Ajusta la caja al texto (en una caja de ancho fijo, solo la altura). */
export function fitText(el: TextElement): TextElement {
  if (el.wrap) {
    const { height } = layoutText(el.text, el.fontSize, el.font, el.width);
    return { ...el, height: Math.max(height, el.fontSize * LINE_HEIGHT) };
  }
  const { width, height } = layoutText(el.text, el.fontSize, el.font);
  return {
    ...el,
    width: Math.max(width, el.fontSize * 0.05),
    height: Math.max(height, el.fontSize * LINE_HEIGHT),
  };
}

/** Las notas mantienen su anchura y crecen hacia abajo si el texto no cabe. */
export function fitNote(el: NoteElement): NoteElement {
  const pad = notePadding(el);
  const { height } = layoutText(el.text, el.fontSize, el.font, el.width - pad * 2);
  return { ...el, height: Math.max(el.width, height + pad * 2) };
}

export function fitEditable<T extends EditableElement>(el: T): T {
  switch (el.type) {
    case 'text':
      return fitText(el) as T;
    case 'note':
      return fitNote(el) as T;
    default:
      return fitContainer(el) as T;
  }
}

/** Texto nuevo con la línea centrada verticalmente en `at`. */
export function createText(
  at: Vec,
  zoom: number,
  styles: ToolStyles,
  z: number,
  /** Caja de ancho fijo (arrastrando con la herramienta de texto): `at` es su esquina. */
  boxWidth?: number,
): TextElement {
  const { size, color, font, align, opacity } = styles.text;
  const fontSize = size / zoom;
  const wrap = boxWidth !== undefined;
  return fitText({
    id: createId(),
    type: 'text',
    z,
    x: at.x,
    y: wrap ? at.y : at.y - (fontSize * LINE_HEIGHT) / 2,
    rotation: 0,
    opacity,
    groupId: null,
    locked: false,
    text: '',
    fontSize,
    color,
    font,
    align,
    wrap,
    width: boxWidth ?? 0,
    height: 0,
  });
}

/** Nota nueva centrada en `at`, del mismo tamaño en pantalla a cualquier zoom. */
export function createNote(at: Vec, zoom: number, styles: ToolStyles, z: number): NoteElement {
  const size = NOTE_SIZE / zoom;
  const { variant, color, textColor, font, align, valign, opacity } = styles.note;
  return {
    id: createId(),
    type: 'note',
    z,
    x: at.x - size / 2,
    y: at.y - size / 2,
    rotation: 0,
    opacity,
    groupId: null,
    locked: false,
    text: '',
    fontSize: styles.note.size / zoom,
    variant,
    color,
    textColor,
    font,
    align,
    valign,
    width: size,
    height: size,
  };
}
