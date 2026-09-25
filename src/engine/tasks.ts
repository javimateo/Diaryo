import { labelLayout, textOf, withText } from './containers';
import { isEditable } from './editing';
import type { SceneElement } from './elements';
import { rotateVec, type Vec } from './math';
import { noteTextLayout } from './render';
import { layoutText, taskBoxes, toggleTask, type TextLayout } from './text';
import type { TextAlign } from './elements';

/**
 * Tareas: líneas que empiezan por "[ ]" (por hacer) o "[x]" (hecha) en textos, notas y
 * figuras. Se pintan como casillas y un clic en la casilla la marca o la desmarca.
 */

interface TextBlock {
  /** Dónde empieza el texto dentro del elemento. */
  x: number;
  y: number;
  layout: TextLayout;
  options: { fontSize: number; font: string; align: TextAlign; boxWidth: number };
}

function textBlock(el: SceneElement): TextBlock | null {
  if (el.type === 'text') {
    const layout = layoutText(el.text, el.fontSize, el.font, el.wrap ? el.width : undefined);
    const options = { fontSize: el.fontSize, font: el.font, align: el.align, boxWidth: el.width };
    return { x: 0, y: 0, layout, options };
  }
  if (el.type === 'note') {
    const layout = noteTextLayout(el);
    const { fontSize, font, align } = el;
    return {
      x: layout.x,
      y: layout.y,
      layout,
      options: { fontSize, font, align, boxWidth: layout.boxWidth },
    };
  }
  if ((el.type === 'shape' || el.type === 'stroke') && el.label?.text) {
    const layout = labelLayout(el, el.label);
    const { fontSize, font, align } = el.label;
    return {
      x: layout.x,
      y: layout.y,
      layout,
      options: { fontSize, font, align, boxWidth: layout.boxWidth },
    };
  }
  return null;
}

/** El párrafo de la tarea cuya casilla está bajo el punto (con un margen), o null. */
export function taskAt(el: SceneElement, world: Vec, slop: number): number | null {
  const block = textBlock(el);
  if (!block || !/\[[ xX]\]/.test(isEditable(el) ? textOf(el) : '')) return null;
  const local = rotateVec({ x: world.x - el.x, y: world.y - el.y }, -el.rotation);
  const p = { x: local.x - block.x, y: local.y - block.y };
  for (const box of taskBoxes(block.layout, block.options)) {
    const inside =
      p.x >= box.x - slop &&
      p.x <= box.x + box.size + slop &&
      p.y >= box.y - slop &&
      p.y <= box.y + box.size + slop;
    if (inside) return box.paragraph;
  }
  return null;
}

/** El elemento con esa tarea marcada (o desmarcada). */
export function withTaskToggled(el: SceneElement, paragraph: number): SceneElement {
  return isEditable(el) ? withText(el, toggleTask(textOf(el), paragraph)) : el;
}
