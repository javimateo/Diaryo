import { canBind, focusFor, insideForBinding, routeArrow } from '../arrows';
import { createId, type ArrowBinding, type ArrowElement, type SceneElement } from '../elements';
import type { Vec } from '../math';
import { drawElementOutline } from '../render';
import type { Scene } from '../scene';
import { drawArrow, newSeed } from '../shapes';
import type { PointerInput, ToolContext, ToolHandler } from './types';

/** Distancia mínima (px de pantalla) para que el arrastre cree una flecha. */
const MIN_LENGTH = 8;

/**
 * Lo que hay bajo el punto al que se puede enganchar una flecha (lo de más arriba),
 * o null. `except`: el elemento que no cuenta (la propia flecha o su otro extremo).
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
    if (el.id === except || el.locked || !canBind(el)) continue;
    if (insideForBinding(el, p, tolerance)) return el;
  }
  return null;
}

export const bindingFor = (el: SceneElement | null, p: Vec): ArrowBinding | null =>
  el ? { elementId: el.id, focus: focusFor(el, p) } : null;

/**
 * Flecha (A): se arrastra de un punto a otro. Si empieza o termina sobre una nota,
 * un texto, una figura o una imagen, se engancha a ella y la sigue al moverla.
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
    // Resalta a qué se engancharía la flecha si se empieza aquí.
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
    // La vista previa ya muestra dónde quedará enganchada.
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
