import { createNote, createText, isEditable } from '../editing';
import type { Vec } from '../math';
import { containerAt, hitTestElement } from '../selection';
import type { PointerInput, ToolContext, ToolHandler } from './types';

const HIT_TOLERANCE = 4;
/** A partir de cuánto arrastre (px de pantalla) se dibuja una caja de texto. */
const BOX_THRESHOLD = 12;

/**
 * Texto (T) y nota (N): un clic crea el elemento y abre el editor. Si se hace clic
 * sobre algo en lo que se puede escribir (un texto, una nota o dentro de una figura),
 * se escribe ahí. Con el texto, arrastrar dibuja una caja de ese ancho: el texto
 * saltará de línea al llegar al borde.
 */
export class CreateHandler implements ToolHandler {
  private drag: { start: Vec; current: Vec } | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly kind: 'text' | 'note',
  ) {}

  onDown(input: PointerInput) {
    const { ctx } = this;
    const { zoom } = ctx.camera;
    const hit = hitTestElement(ctx.scene, input.world, HIT_TOLERANCE / zoom);
    const target = hit && isEditable(hit) ? hit : hit ? null : containerAt(ctx.scene, input.world);
    if (target) {
      ctx.startEditing(target, false);
      return;
    }
    if (this.kind === 'note') {
      ctx.startEditing(createNote(input.world, zoom, ctx.styles, ctx.scene.nextZ()), true);
      return;
    }
    this.drag = { start: input.world, current: input.world };
  }

  onMove(inputs: PointerInput[]) {
    if (!this.drag) return;
    this.drag.current = inputs[inputs.length - 1].world;
    this.ctx.invalidateOverlay();
  }

  onUp() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const { ctx } = this;
    const { zoom } = ctx.camera;
    const z = ctx.scene.nextZ();
    const width = Math.abs(drag.current.x - drag.start.x);
    ctx.invalidateOverlay();
    if (width * zoom < BOX_THRESHOLD) {
      ctx.startEditing(createText(drag.start, zoom, ctx.styles, z), true);
      return;
    }
    const corner = {
      x: Math.min(drag.start.x, drag.current.x),
      y: Math.min(drag.start.y, drag.current.y),
    };
    ctx.startEditing(createText(corner, zoom, ctx.styles, z, width), true);
  }

  onCancel() {
    this.drag = null;
    this.ctx.invalidateOverlay();
  }

  /** Mientras se arrastra, el contorno de la caja que se va a crear. */
  renderOverlay(g: CanvasRenderingContext2D) {
    const drag = this.drag;
    if (!drag) return;
    const { zoom } = this.ctx.camera;
    const x = Math.min(drag.start.x, drag.current.x);
    const y = Math.min(drag.start.y, drag.current.y);
    const w = Math.abs(drag.current.x - drag.start.x);
    const h = Math.max(
      Math.abs(drag.current.y - drag.start.y),
      (this.ctx.styles.text.size * 1.25) / zoom,
    );
    if (w * zoom < BOX_THRESHOLD) return;
    g.save();
    g.strokeStyle = this.ctx.colors.accent;
    g.lineWidth = 1.5 / zoom;
    g.setLineDash([6 / zoom, 5 / zoom]);
    g.strokeRect(x, y, w, h);
    g.restore();
  }
}
