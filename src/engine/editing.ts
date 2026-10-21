import {
  createId,
  NOTE_SIZE,
  type EditableElement,
  type NoteElement,
  type SceneElement,
  type TextElement,
  type ToolStyles,
} from './elements';
import {
  defaultLabel,
  fitContainer,
  isClosedStroke,
  isContainer,
  textOf,
  withText,
} from './containers';
import type { Vec } from './math';
import { notePadding } from './render';
import type { Changes } from './scene';
import { completeTextDates, layoutText, LINE_HEIGHT } from './text';

/** Can it be written on? Texts, notes, shapes and closed strokes. */
export function isEditable(el: SceneElement): el is EditableElement {
  if (el.type === 'stroke') return isClosedStroke(el);
  return el.type !== 'image';
}

/** Fits the box to the text (in a fixed-width box, only the height). */
export function fitText(el: TextElement): TextElement {
  if (el.wrap) {
    const { height } = layoutText(el.text, el.fontSize, el, el.width);
    return { ...el, height: Math.max(height, el.fontSize * LINE_HEIGHT) };
  }
  const { width, height } = layoutText(el.text, el.fontSize, el);
  return {
    ...el,
    width: Math.max(width, el.fontSize * 0.05),
    height: Math.max(height, el.fontSize * LINE_HEIGHT),
  };
}

/** Notes keep their width and grow downwards if the text doesn't fit. */
export function fitNote(el: NoteElement): NoteElement {
  const pad = notePadding(el);
  const { height } = layoutText(el.text, el.fontSize, el, el.width - pad * 2);
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

/** New text with its line vertically centered at `at`. */
export function createText(
  at: Vec,
  zoom: number,
  styles: ToolStyles,
  z: number,
  /** Fixed-width box (dragging with the text tool): `at` is its corner. */
  boxWidth?: number,
): TextElement {
  const { size, color, font, align, opacity, bold, italic, underline } = styles.text;
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
    ...(bold && { bold }),
    ...(italic && { italic }),
    ...(underline && { underline }),
    wrap,
    width: boxWidth ?? 0,
    height: 0,
  });
}

/** New note centered at `at`, the same size on screen at any zoom. */
export function createNote(
  at: Vec,
  zoom: number,
  styles: ToolStyles,
  z: number,
  screenSize = NOTE_SIZE,
): NoteElement {
  const size = screenSize / zoom;
  const { variant, color, textColor, font, align, valign, opacity, bold, italic, underline } =
    styles.note;
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
    ...(bold && { bold }),
    ...(italic && { italic }),
    ...(underline && { underline }),
    width: size,
    height: size,
  };
}

/** The element as it opens in the editor: a shape without text gets an empty one. */
export function readyToEdit<T extends EditableElement>(
  element: T,
  styles: ToolStyles,
  zoom: number,
): T {
  return isContainer(element) && !element.label
    ? { ...element, label: defaultLabel(styles, zoom) }
    : element;
}

/**
 * What closing the editor keeps: the changes to save (null: none) and the element to
 * select (null: it is gone). An empty text is deleted; an empty note is kept (it works as
 * a block of color).
 */
export function finishEdit(
  edited: EditableElement,
  original: SceneElement | undefined,
  isNew: boolean,
): { changes: Changes | null; result: EditableElement | null } {
  let element = edited;
  // The dates are written in full ("@mañana" would be another day tomorrow) and take the
  // room of their labels again.
  if (textOf(element).includes('@')) {
    element = fitEditable(withText(element, completeTextDates(textOf(element))));
  }
  const empty = textOf(element).trim() === '';
  if (element.type === 'text' && empty) {
    return { changes: original ? new Map([[element.id, null]]) : null, result: null };
  }
  // A shape without text stops having a label.
  if (isContainer(element) && empty) element = { ...element, label: null };
  // Any property counts (text, font, alignment, opacity…).
  const unchanged = !!original && JSON.stringify(original) === JSON.stringify(element);
  const changes = isNew || !unchanged ? new Map([[element.id, element]]) : null;
  return { changes, result: element };
}
