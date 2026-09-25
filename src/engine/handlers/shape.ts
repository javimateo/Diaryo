import { createId, type ShapeElement, type ShapeKind } from '../elements';
import type { Vec } from '../math';
import { drawShape, newSeed } from '../shapes';
import type { PointerInput, ToolContext, ToolHandler } from './types';

/** Size (screen px) of a shape created with a simple click. */
const DEFAULT_SIZE = { rect: { w: 160, h: 100 }, ellipse: { w: 120, h: 120 } };

/**
 * Rectangle (R) and ellipse (O): drag from corner to corner. Shift makes it square or
 * circular; Alt draws it from the center. On release you can write inside right away,
 * like in a note (if nothing is written, the shape stays alone).
 */
export class ShapeHandler implements ToolHandler {
  private drag: { start: Vec; current: Vec; shift: boolean; alt: boolean; seed: number } | null =
    null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly shape: ShapeKind,
  ) {}

  onDown(input: PointerInput) {
    this.drag = {
      start: input.world,
      current: input.world,
      shift: input.shiftKey,
      alt: input.altKey,
      seed: newSeed(),
    };
    this.ctx.invalidateOverlay();
  }

  onMove(inputs: PointerInput[]) {
    if (!this.drag) return;
    const input = inputs[inputs.length - 1];
    this.drag = { ...this.drag, current: input.world, shift: input.shiftKey, alt: input.altKey };
    this.ctx.invalidateOverlay();
  }

  onUp() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const { zoom } = this.ctx.camera;
    let element = this.build(drag);
    // A click without dragging creates a normal-size shape centered on the point.
    if (element.width * zoom < 6 && element.height * zoom < 6) {
      const { w, h } = DEFAULT_SIZE[this.shape];
      element = {
        ...element,
        x: drag.start.x - w / zoom / 2,
        y: drag.start.y - h / zoom / 2,
        width: w / zoom,
        height: h / zoom,
      };
    }
    this.ctx.invalidateOverlay();
    this.ctx.startEditing(element, true);
  }

  onCancel() {
    this.drag = null;
    this.ctx.invalidateOverlay();
  }

  renderOverlay(g: CanvasRenderingContext2D) {
    if (!this.drag) return;
    const el = this.build(this.drag);
    g.save();
    g.globalAlpha = el.opacity;
    g.translate(el.x, el.y);
    drawShape(g, el, this.ctx.mode);
    g.restore();
  }

  private build(drag: NonNullable<ShapeHandler['drag']>): ShapeElement {
    const { start, current, shift, alt, seed } = drag;
    let dx = current.x - start.x;
    let dy = current.y - start.y;
    if (shift) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * side;
      dy = Math.sign(dy || 1) * side;
    }
    const [x0, x1] = alt ? [start.x - dx, start.x + dx] : [start.x, start.x + dx];
    const [y0, y1] = alt ? [start.y - dy, start.y + dy] : [start.y, start.y + dy];
    const style = this.ctx.styles.shape;
    return {
      id: createId(),
      type: 'shape',
      shape: this.shape,
      z: this.ctx.scene.nextZ(),
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
      rotation: 0,
      opacity: style.opacity,
      groupId: null,
      locked: false,
      color: style.color,
      border: style.border,
      strokeWidth: style.size / this.ctx.camera.zoom,
      roughness: style.roughness,
      seed,
      fill: style.fill,
      fillStyle: style.fillStyle,
      label: null,
    };
  }
}
