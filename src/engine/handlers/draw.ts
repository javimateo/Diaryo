import { createId, type StrokeElement, type StrokeKind } from '../elements';
import { applyStrokePaint, buildStrokePath } from '../strokes';
import type { PointerInput, ToolContext, ToolHandler } from './types';

interface ActiveStroke {
  /** Puntos absolutos del mundo: [x, y, presión, …]. */
  points: number[];
  size: number;
  simulatePressure: boolean;
}

/** Lápiz y marcador: el trazo en curso se pinta en la capa superior y al soltar pasa a la escena. */
export class DrawHandler implements ToolHandler {
  private stroke: ActiveStroke | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly kind: StrokeKind,
  ) {}

  onDown(input: PointerInput) {
    const style = this.ctx.styles[this.kind];
    this.stroke = {
      points: [],
      size: style.size / this.ctx.camera.zoom,
      // Solo los lápices digitales dan presión real.
      simulatePressure: input.pointerType !== 'pen',
    };
    this.addPoint(input);
    this.ctx.invalidateOverlay();
  }

  onMove(inputs: PointerInput[]) {
    if (!this.stroke) return;
    for (const input of inputs) this.addPoint(input);
    this.ctx.invalidateOverlay();
  }

  onUp() {
    const stroke = this.stroke;
    if (!stroke) return;
    this.stroke = null;

    const [ox, oy] = stroke.points;
    const relative = stroke.points.map((v, i) =>
      i % 3 === 0 ? round(v - ox) : i % 3 === 1 ? round(v - oy) : round(v),
    );
    const { color, opacity } = this.ctx.styles[this.kind];
    const element: StrokeElement = {
      id: createId(),
      type: 'stroke',
      kind: this.kind,
      z: this.ctx.scene.nextZ(),
      x: ox,
      y: oy,
      rotation: 0,
      opacity,
      groupId: null,
      locked: false,
      points: relative,
      simulatePressure: stroke.simulatePressure,
      color,
      size: stroke.size,
      fill: null,
      fillStyle: 'solid',
      label: null,
    };
    this.ctx.commit(new Map([[element.id, element]]));
    this.ctx.invalidateOverlay();
  }

  onCancel() {
    this.stroke = null;
    this.ctx.invalidateOverlay();
  }

  renderOverlay(g: CanvasRenderingContext2D) {
    const stroke = this.stroke;
    if (!stroke) return;
    const { color, opacity } = this.ctx.styles[this.kind];
    applyStrokePaint(g, this.kind, color, this.ctx.mode, opacity);
    g.fill(buildStrokePath({ kind: this.kind, ...stroke }, false));
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private addPoint(input: PointerInput) {
    const points = this.stroke!.points;
    const n = points.length;
    const { x, y } = input.world;
    // Ignorar puntos repetidos (el ratón quieto sigue enviando eventos).
    if (n >= 3 && points[n - 3] === x && points[n - 2] === y) return;
    points.push(x, y, input.pressure || 0.5);
  }
}

/** Redondeo a centésimas: suficiente precisión y ocupa menos al guardar. */
const round = (v: number) => Math.round(v * 100) / 100;
