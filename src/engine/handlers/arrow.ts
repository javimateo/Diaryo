import { canBind, focusFor, insideForBinding, routeArrow } from '../arrows';
import {
  createId,
  isLocked,
  type ArrowBinding,
  type ArrowElement,
  type SceneElement,
} from '../elements';
import type { Vec } from '../math';
import { drawElementOutline } from '../render';
import type { Scene } from '../scene';
import { drawArrow, newSeed } from '../shapes';
import type { PointerInput, ToolContext, ToolHandler } from './types';

/** Minimum distance (screen px) for a drag to create an arrow. */
const MIN_LENGTH = 8;

/**
 * What is under the point that an arrow can attach to (the topmost), or null. `except`:
 * the element that doesn't count (the arrow itself or its other end).
 */
export function bindTargetAt(
  scene: Scene,
  p: Vec,
  tolerance: number,
  except?: string,
): SceneElement | null {
  const candidates = scene.search({
    minX: p.x - tolerance,
    minY: p.y - tolerance,
    maxX: p.x + tolerance,
    maxY: p.y + tolerance,
  });
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el.id === except || isLocked(el) || !canBind(el)) continue;
    if (insideForBinding(el, p, tolerance)) return el;
  }
  return null;
}

export const bindingFor = (el: SceneElement | null, p: Vec): ArrowBinding | null =>
  el ? { elementId: el.id, focus: focusFor(el, p) } : null;

/**
 * Arrow (A): drag from one point to another. If it starts or ends on a note, a text, a
 * shape or an image, it attaches to it and follows it when it moves.
 */
export class ArrowHandler implements ToolHandler {
  private drag: { start: Vec; current: Vec; seed: number } | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onDown(input: PointerInput) {
    this.drag = { start: input.world, current: input.world, seed: newSeed() };
    this.ctx.invalidateOverlay();
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
    this.ctx.invalidateOverlay();
    const { zoom } = this.ctx.camera;
    const length = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y);
    if (length * zoom < MIN_LENGTH) return;
    const arrow = this.build(drag);
    this.ctx.commit(new Map([[arrow.id, arrow]]));
    this.ctx.requestTool('select');
    this.ctx.setSelection([arrow.id]);
  }

  onCancel() {
    this.drag = null;
    this.ctx.invalidateOverlay();
  }

  private hoverId: string | null = null;

  onHover(input: PointerInput): string | null {
    // Highlights what the arrow would attach to if it started here.
    const target = this.targetAt(input.world);
    if (target?.id !== this.hoverId) {
      this.hoverId = target?.id ?? null;
      this.ctx.invalidateOverlay();
    }
    return null;
  }

  renderOverlay(g: CanvasRenderingContext2D) {
    const { zoom } = this.ctx.camera;
    const drag = this.drag;
    const highlight = (id: string | null | undefined) => {
      const el = id ? this.ctx.scene.get(id) : undefined;
      if (el) drawElementOutline(g, el, zoom, this.ctx.colors.accent, 1);
    };
    if (!drag) {
      highlight(this.hoverId);
      return;
    }
    const arrow = this.build(drag);
    highlight(arrow.start?.elementId);
    highlight(arrow.end?.elementId);
    g.save();
    g.globalAlpha = arrow.opacity;
    // The preview already shows where it will be attached.
    const preview = routeArrow(arrow, (id) => this.ctx.scene.get(id));
    g.translate(preview.x, preview.y);
    drawArrow(g, preview, this.ctx.mode);
    g.restore();
  }

  private targetAt(p: Vec, except?: string) {
    return bindTargetAt(this.ctx.scene, p, 4 / this.ctx.camera.zoom, except);
  }

  private build(drag: NonNullable<ArrowHandler['drag']>): ArrowElement {
    const { start, current, seed } = drag;
    const style = this.ctx.styles.arrow;
    const startTarget = this.targetAt(start);
    const endTarget = this.targetAt(current, startTarget?.id);
    return {
      id: createId(),
      type: 'arrow',
      z: this.ctx.scene.nextZ(),
      x: start.x,
      y: start.y,
      rotation: 0,
      opacity: style.opacity,
      groupId: null,
      locked: false,
      points: [0, 0, 0, current.x - start.x, current.y - start.y, 0],
      bend: 0,
      start: bindingFor(startTarget, start),
      end: bindingFor(endTarget, current),
      color: style.color,
      size: style.size / this.ctx.camera.zoom,
      roughness: style.roughness,
      seed,
      startHead: style.startHead,
      endHead: style.endHead,
    };
  }
}
