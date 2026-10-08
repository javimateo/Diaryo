import { isLocked, isPrivateNote } from '../elements';
import { segmentBounds } from '../geometry';
import type { Vec } from '../math';
import { elementHitsSegment } from '../hit';
import type { PointerInput, ToolContext, ToolHandler } from './types';

/** Eraser radius in screen pixels. */
export const ERASER_RADIUS = 8;
const TRAIL_MS = 180;
const ERASING_OPACITY = 0.2;

/**
 * Deletes whole strokes when passing over them. While dragging, the touched strokes are
 * dimmed; on release they are all deleted together (a single "undo").
 */
export class EraseHandler implements ToolHandler {
  private readonly erasing = new Set<string>();
  private last: Vec | null = null;
  private trail: { x: number; y: number; t: number }[] = [];

  constructor(private readonly ctx: ToolContext) {}

  onDown(input: PointerInput) {
    this.erasing.clear();
    this.trail = [];
    this.last = input.world;
    this.eraseAlong(input.world, input.world);
    this.trail.push({ ...input.world, t: input.time });
    this.ctx.invalidateOverlay();
  }

  onMove(inputs: PointerInput[]) {
    if (!this.last) return;
    for (const input of inputs) {
      this.eraseAlong(this.last, input.world);
      this.last = input.world;
      this.trail.push({ ...input.world, t: input.time });
    }
    this.ctx.invalidateOverlay();
  }

  onUp() {
    if (!this.last) return;
    this.last = null;
    if (this.erasing.size > 0) {
      this.ctx.commit(new Map([...this.erasing].map((id) => [id, null])));
      this.erasing.clear();
    }
    this.ctx.invalidateOverlay();
  }

  onCancel() {
    this.last = null;
    this.trail = [];
    this.erasing.clear();
    this.ctx.invalidateScene();
    this.ctx.invalidateOverlay();
  }

  elementOpacity(id: string) {
    return this.erasing.has(id) ? ERASING_OPACITY : 1;
  }

  isAnimating() {
    return this.trail.length > 0;
  }

  /** Trail fading behind the eraser. */
  renderOverlay(g: CanvasRenderingContext2D, now: number) {
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS);
    const trail = this.trail;
    if (trail.length === 0) return;

    const zoom = this.ctx.camera.zoom;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = this.ctx.mode === 'dark' ? '#ffffff' : '#000000';
    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i].t) / TRAIL_MS;
      g.globalAlpha = 0.12 * (1 - age);
      g.lineWidth = ((ERASER_RADIUS * 2) / zoom) * (1 - age * 0.5);
      g.beginPath();
      g.moveTo(trail[i - 1].x, trail[i - 1].y);
      g.lineTo(trail[i].x, trail[i].y);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private eraseAlong(a: Vec, b: Vec) {
    const radius = ERASER_RADIUS / this.ctx.camera.zoom;
    let changed = false;
    for (const el of this.ctx.scene.search(segmentBounds(a, b, radius))) {
      // A private note is never erased: deleting it asks for the diary password.
      if (this.erasing.has(el.id) || isLocked(el) || isPrivateNote(el)) continue;
      if (elementHitsSegment(el, a, b, radius)) {
        this.erasing.add(el.id);
        changed = true;
      }
    }
    if (changed) this.ctx.invalidateScene();
  }
}
