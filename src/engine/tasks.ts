import { labelLayout, textOf, withText } from './containers';
import { isEditable } from './editing';
import type { SceneElement } from './elements';
import { rotateVec, type Vec } from './math';
import { noteTextLayout } from './render';
import { layoutText, taskBoxes, toggleTask, type TextFace, type TextLayout } from './text';
import type { TextAlign } from './elements';

/**
 * Tasks: lines starting with "[ ]" (to do) or "[x]" (done) in texts, notes and shapes.
 * They are painted as checkboxes and a click on the checkbox ticks or unticks it.
 */

interface TextBlock {
  /** Where the text starts inside the element. */
  x: number;
  y: number;
  layout: TextLayout;
  options: { fontSize: number; face: TextFace; align: TextAlign; boxWidth: number };
}

function textBlock(el: SceneElement): TextBlock | null {
  if (el.type === 'text') {
    const layout = layoutText(el.text, el.fontSize, el, el.wrap ? el.width : undefined);
    const options = { fontSize: el.fontSize, face: el, align: el.align, boxWidth: el.width };
    return { x: 0, y: 0, layout, options };
  }
  if (el.type === 'note') {
    const layout = noteTextLayout(el);
    const { fontSize, align } = el;
    return {
      x: layout.x,
      y: layout.y,
      layout,
      options: { fontSize, face: el, align, boxWidth: layout.boxWidth },
    };
  }
  if ((el.type === 'shape' || el.type === 'stroke') && el.label?.text) {
    const layout = labelLayout(el, el.label);
    const { fontSize, align } = el.label;
    return {
      x: layout.x,
      y: layout.y,
      layout,
      options: { fontSize, face: el.label, align, boxWidth: layout.boxWidth },
    };
  }
  return null;
}

/** Paragraph of the task whose checkbox is under the point (with a margin), or null. */
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

/** The element with that task ticked (or unticked). */
export function withTaskToggled(el: SceneElement, paragraph: number): SceneElement {
  return isEditable(el) ? withText(el, toggleTask(textOf(el), paragraph)) : el;
}
