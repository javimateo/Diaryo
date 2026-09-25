import { arrowEnd, arrowMidpoint, arrowStart, detachMoved, withEnds } from '../arrows';
import { ROTATE_CURSOR } from '../cursors';
import type { ArrowElement, SceneElement } from '../elements';
import type { Vec } from '../math';
import type { Changes } from '../scene';
import { drawElementOutline } from '../render';
import {
  drawSelectionBox,
  elementsInLasso,
  elementsInRect,
  HANDLE_DIRECTIONS,
  hitHandle,
  hitTestElement,
  pointInBox,
  resizeCursor,
  type ResizeHandle,
} from '../selection';
import {
  rotateElement,
  scaleElement,
  selectionBox,
  toBox,
  translateElement,
  type Box,
} from '../transform';
import { bindingFor, bindTargetAt } from './arrow';
import type { PointerInput, ToolContext, ToolHandler } from './types';

/** Distancia (px de pantalla) antes de considerar que un clic es un arrastre. */
const DRAG_THRESHOLD = 3;
/** Tolerancia (px de pantalla) para acertar a un trazo con el ratón. */
const HIT_TOLERANCE = 6;
/** Separación mínima (px de pantalla) entre puntos del lazo. */
const LASSO_SPACING = 2;
/** Con Shift el giro salta de 15 en 15 grados. */
const ROTATION_SNAP = Math.PI / 12;
const MIN_SCALE = 0.01;
/** Radio (px de pantalla) de los puntos para editar una flecha. */
const ARROW_HANDLE = 6;
/** Por debajo de esta curva (px de pantalla) la flecha vuelve a ser recta. */
const STRAIGHT_SNAP = 8;

type ArrowPoint = 'start' | 'end' | 'bend';

type State =
  | { type: 'idle' }
  /** Botón pulsado sobre algo; aún no se sabe si es un clic o un arrastre. */
  | { type: 'pending'; start: PointerInput; onClick: (() => void) | null }
  | { type: 'move'; start: Vec; originals: Changes }
  | { type: 'resize'; handle: ResizeHandle; box: Box; originals: Changes }
  | { type: 'rotate'; box: Box; startAngle: number; delta: number; originals: Changes }
  | { type: 'marquee'; start: Vec; current: Vec; base: Set<string> }
  | { type: 'lasso'; points: Vec[]; base: Set<string>; additive: boolean }
  /** Arrastrando un extremo de la flecha seleccionada, o su centro para curvarla. */
  | { type: 'arrow'; point: ArrowPoint; original: ArrowElement; target: string | null };

/**
 * Seleccionar (V) y lazo (L). Comparten todo salvo lo que ocurre al arrastrar sobre
 * un hueco: V dibuja un rectángulo (o un lazo con Alt) y L siempre un lazo.
 */
export class SelectHandler implements ToolHandler {
  private state: State = { type: 'idle' };
  private hoverId: string | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly mode: 'rect' | 'lasso',
  ) {}

  onDown(input: PointerInput) {
    const { ctx } = this;
    const zoom = ctx.camera.zoom;
    this.setHover(null);

    const arrow = this.selectedArrow();
    const point = arrow && this.arrowPointAt(arrow, input.world);
    if (arrow && point) {
      this.state = { type: 'arrow', point, original: arrow, target: null };
      return;
    }

    const box = this.box();
    if (box) {
      const handle = hitHandle(box, input.world, zoom);
      if (handle === 'rotate') {
        this.state = {
          type: 'rotate',
          box,
          startAngle: Math.atan2(input.world.y - box.cy, input.world.x - box.cx),
          delta: 0,
          originals: this.snapshot(),
        };
        return;
      }
      if (handle) {
        this.state = { type: 'resize', handle, box, originals: this.snapshot() };
        return;
      }
    }

    const selection = ctx.selection;
    const hit = hitTestElement(ctx.scene, input.world, HIT_TOLERANCE / zoom);
    const onSelected = !!hit && selection.has(hit.id);
    const insideBox = !!box && pointInBox(box, input.world);

    if (this.mode === 'lasso' && !onSelected && !insideBox) {
      this.startLasso(input);
      return;
    }

    if (hit) {
      if (input.shiftKey && onSelected) {
        // Shift + clic sobre algo seleccionado lo quita de la selección (con su grupo).
        const inGroup = (id: string) =>
          id === hit.id || (!!hit.groupId && ctx.scene.get(id)?.groupId === hit.groupId);
        ctx.setSelection([...selection].filter((id) => !inGroup(id)));
        this.state = { type: 'idle' };
      } else if (input.shiftKey) {
        ctx.setSelection([...selection, hit.id]);
        this.state = { type: 'pending', start: input, onClick: null };
      } else if (!onSelected) {
        ctx.setSelection([hit.id]);
        this.state = { type: 'pending', start: input, onClick: null };
      } else {
        // Clic (sin arrastrar) sobre uno de varios seleccionados: quedarse solo con él.
        const onClick = selection.size > 1 ? () => ctx.setSelection([hit.id]) : null;
        this.state = { type: 'pending', start: input, onClick };
      }
      return;
    }

    if (insideBox) {
      // Dentro del marco se puede arrastrar; un clic sin arrastrar deselecciona.
      this.state = { type: 'pending', start: input, onClick: () => ctx.setSelection([]) };
      return;
    }

    if (input.altKey) {
      this.startLasso(input);
      return;
    }
    const base = input.shiftKey ? new Set(selection) : new Set<string>();
    if (!input.shiftKey) ctx.setSelection([]);
    this.state = { type: 'marquee', start: input.world, current: input.world, base };
  }

  onMove(inputs: PointerInput[]) {
    const input = inputs[inputs.length - 1];
    const state = this.state;

    switch (state.type) {
      case 'pending': {
        const dx = input.screen.x - state.start.screen.x;
        const dy = input.screen.y - state.start.screen.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const move: State = { type: 'move', start: state.start.world, originals: this.snapshot() };
        this.state = move;
        this.move(move, input);
        return;
      }
      case 'move':
        this.move(state, input);
        return;
      case 'resize':
        this.resize(state, input);
        return;
      case 'rotate':
        this.rotate(state, input);
        return;
      case 'arrow':
        this.editArrow(state, input);
        return;
      case 'marquee': {
        state.current = input.world;
        const rect = {
          minX: Math.min(state.start.x, state.current.x),
          minY: Math.min(state.start.y, state.current.y),
          maxX: Math.max(state.start.x, state.current.x),
          maxY: Math.max(state.start.y, state.current.y),
        };
        const ids = elementsInRect(this.ctx.scene, rect).map((el) => el.id);
        this.ctx.setSelection(new Set([...state.base, ...ids]));
        // El rectángulo se redibuja siempre, aunque la selección no haya cambiado.
        this.ctx.invalidateOverlay();
        return;
      }
      case 'lasso': {
        const spacing = LASSO_SPACING / this.ctx.camera.zoom;
        for (const { world } of inputs) {
          const last = state.points[state.points.length - 1];
          if (Math.hypot(world.x - last.x, world.y - last.y) >= spacing) state.points.push(world);
        }
        this.ctx.invalidateOverlay();
        return;
      }
    }
  }

  onUp() {
    const state = this.state;
    this.state = { type: 'idle' };
    switch (state.type) {
      case 'pending':
        state.onClick?.();
        break;
      case 'move':
      case 'resize':
      case 'rotate':
        this.ctx.commitPreview(state.originals);
        break;
      case 'arrow':
        this.ctx.commitPreview(new Map([[state.original.id, state.original]]));
        break;
      case 'lasso':
        this.finishLasso(state);
        break;
    }
    this.ctx.invalidateOverlay();
  }

  onCancel() {
    const state = this.state;
    this.state = { type: 'idle' };
    if (state.type === 'move' || state.type === 'resize' || state.type === 'rotate') {
      this.ctx.cancelPreview(state.originals);
    }
    if (state.type === 'arrow') {
      this.ctx.cancelPreview(new Map([[state.original.id, state.original]]));
    }
    this.ctx.invalidateOverlay();
  }

  onHover(input: PointerInput): string | null {
    const { ctx } = this;
    const zoom = ctx.camera.zoom;
    const arrow = this.selectedArrow();
    if (arrow && this.arrowPointAt(arrow, input.world)) {
      this.setHover(null);
      return 'pointer';
    }
    const box = this.box();
    if (box) {
      const handle = hitHandle(box, input.world, zoom);
      if (handle) {
        this.setHover(null);
        return handle === 'rotate' ? ROTATE_CURSOR : resizeCursor(handle, box.rotation);
      }
    }
    const hit = hitTestElement(ctx.scene, input.world, HIT_TOLERANCE / zoom);
    const onSelected = !!hit && ctx.selection.has(hit.id);
    const insideBox = !!box && pointInBox(box, input.world);

    if (this.mode === 'lasso') {
      this.setHover(null);
      return onSelected || insideBox ? 'move' : null;
    }
    this.setHover(hit && !onSelected ? hit.id : null);
    return hit || insideBox ? 'move' : null;
  }

  renderOverlay(g: CanvasRenderingContext2D) {
    const { ctx, state } = this;
    const zoom = ctx.camera.zoom;
    const { accent } = ctx.colors;

    if (this.hoverId && state.type === 'idle') {
      const el = ctx.scene.get(this.hoverId);
      if (el) drawElementOutline(g, el, zoom, accent, 0.7);
    }

    const selected = this.selectedElements();
    // Con varios elementos se marca cada uno para ver qué entra en la selección.
    if (selected.length > 1 && selected.length <= 500) {
      for (const el of selected) drawElementOutline(g, el, zoom, accent, 0.5);
    }

    // Una flecha sola no lleva marco: sus puntos para editarla (y lo que se enganchará).
    const arrow = this.selectedArrow();
    if (arrow) {
      if (state.type === 'arrow' && state.target) {
        const target = ctx.scene.get(state.target);
        if (target) drawElementOutline(g, target, zoom, accent, 1);
      }
      if (state.type !== 'move') this.drawArrowHandles(g, arrow);
      return;
    }

    const box =
      state.type === 'rotate'
        ? { ...state.box, rotation: state.box.rotation + state.delta }
        : selectionBox(selected);
    if (box) {
      const transforming =
        state.type === 'move' || state.type === 'resize' || state.type === 'rotate';
      drawSelectionBox(g, box, zoom, ctx.colors, !transforming);
    }

    if (state.type === 'marquee') {
      const x = Math.min(state.start.x, state.current.x);
      const y = Math.min(state.start.y, state.current.y);
      const w = Math.abs(state.current.x - state.start.x);
      const h = Math.abs(state.current.y - state.start.y);
      g.save();
      g.fillStyle = accent;
      g.globalAlpha = 0.08;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 0.9;
      g.strokeStyle = accent;
      g.lineWidth = 1 / zoom;
      g.strokeRect(x, y, w, h);
      g.restore();
    }

    if (state.type === 'lasso' && state.points.length > 1) {
      g.save();
      g.beginPath();
      state.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = accent;
      g.globalAlpha = 0.08;
      g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = accent;
      g.lineWidth = 1.5 / zoom;
      g.lineJoin = 'round';
      g.setLineDash([5 / zoom, 4 / zoom]);
      g.stroke();
      g.restore();
    }
  }

  // ─── Gestos ─────────────────────────────────────────────────

  private move(state: Extract<State, { type: 'move' }>, input: PointerInput) {
    let dx = input.world.x - state.start.x;
    let dy = input.world.y - state.start.y;
    // Shift: solo en horizontal o en vertical.
    if (input.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    this.ctx.preview(this.mapOriginals(state.originals, (el) => translateElement(el, dx, dy)));
  }

  /**
   * Las esquinas mantienen la proporción (Shift para deformar libremente) y los
   * bordes estiran en un solo eje (Shift para mantenerla). Alt escala desde el centro.
   */
  private resize(state: Extract<State, { type: 'resize' }>, input: PointerInput) {
    const { box, handle } = state;
    const d = HANDLE_DIRECTIONS[handle];
    const p = toBox(box, input.world);
    const w = box.width / 2;
    const h = box.height / 2;
    const anchor = input.altKey ? { x: 0, y: 0 } : { x: -d.x * w, y: -d.y * h };

    let sx = d.x === 0 ? 1 : ratio(p.x - anchor.x, d.x * w - anchor.x);
    let sy = d.y === 0 ? 1 : ratio(p.y - anchor.y, d.y * h - anchor.y);

    const corner = d.x !== 0 && d.y !== 0;
    const keepRatio = corner ? !input.shiftKey : input.shiftKey;
    if (keepRatio) {
      if (corner) {
        const m = Math.max(Math.abs(sx), Math.abs(sy));
        sx = (Math.sign(sx) || 1) * m;
        sy = (Math.sign(sy) || 1) * m;
      } else if (d.x !== 0) {
        sy = Math.abs(sx);
      } else {
        sx = Math.abs(sy);
      }
    }
    sx = limitScale(sx);
    sy = limitScale(sy);
    this.ctx.preview(
      this.mapOriginals(state.originals, (el) => scaleElement(el, box, anchor, sx, sy)),
    );
  }

  private rotate(state: Extract<State, { type: 'rotate' }>, input: PointerInput) {
    const { box } = state;
    const angle = Math.atan2(input.world.y - box.cy, input.world.x - box.cx);
    let delta = angle - state.startAngle;
    if (input.shiftKey) {
      const total = Math.round((box.rotation + delta) / ROTATION_SNAP) * ROTATION_SNAP;
      delta = total - box.rotation;
    }
    state.delta = delta;
    const pivot = { x: box.cx, y: box.cy };
    this.ctx.preview(this.mapOriginals(state.originals, (el) => rotateElement(el, pivot, delta)));
  }

  private startLasso(input: PointerInput) {
    const additive = input.shiftKey;
    const base = additive ? new Set(this.ctx.selection) : new Set<string>();
    if (!additive) this.ctx.setSelection([]);
    this.state = { type: 'lasso', points: [input.world], base, additive };
  }

  private finishLasso(state: Extract<State, { type: 'lasso' }>) {
    const { ctx } = this;
    const zoom = ctx.camera.zoom;
    const [first] = state.points;
    const extent = Math.max(
      ...state.points.map((p) => Math.hypot(p.x - first.x, p.y - first.y) * zoom),
    );

    // Un lazo diminuto es un clic: selecciona lo que haya debajo.
    if (extent < 4) {
      const hit = hitTestElement(ctx.scene, first, HIT_TOLERANCE / zoom);
      if (hit) ctx.setSelection(state.additive ? [...state.base, hit.id] : [hit.id]);
      return;
    }
    const ids = elementsInLasso(ctx.scene, state.points).map((el) => el.id);
    ctx.setSelection(new Set([...state.base, ...ids]));
  }

  // ─── Utilidades ─────────────────────────────────────────────

  private selectedElements(): SceneElement[] {
    const result: SceneElement[] = [];
    for (const id of this.ctx.selection) {
      const el = this.ctx.scene.get(id);
      if (el) result.push(el);
    }
    return result;
  }

  private box(): Box | null {
    // Una flecha sola se edita por sus puntos, no con el marco.
    if (this.selectedArrow()) return null;
    return selectionBox(this.selectedElements());
  }

  /** La flecha seleccionada, si es lo único seleccionado (y no está bloqueada). */
  private selectedArrow(): ArrowElement | null {
    const selected = this.selectedElements();
    const [el] = selected;
    return selected.length === 1 && el.type === 'arrow' && !el.locked ? el : null;
  }

  private arrowPoints(arrow: ArrowElement): [ArrowPoint, Vec][] {
    return [
      ['start', arrowStart(arrow)],
      ['end', arrowEnd(arrow)],
      ['bend', arrowMidpoint(arrow)],
    ];
  }

  private arrowPointAt(arrow: ArrowElement, p: Vec): ArrowPoint | null {
    const reach = (ARROW_HANDLE + 3) / this.ctx.camera.zoom;
    for (const [point, at] of this.arrowPoints(arrow)) {
      if (Math.hypot(p.x - at.x, p.y - at.y) <= reach) return point;
    }
    return null;
  }

  /**
   * Los extremos se mueven (y se enganchan a lo que haya debajo); el centro curva la
   * flecha. Cerca de la recta vuelve a ser recta.
   */
  private editArrow(state: Extract<State, { type: 'arrow' }>, input: PointerInput) {
    const { ctx } = this;
    const zoom = ctx.camera.zoom;
    const arrow = ctx.scene.get(state.original.id);
    if (arrow?.type !== 'arrow') return;
    const p = input.world;
    let next: ArrowElement;
    if (state.point === 'bend') {
      const s = arrowStart(arrow);
      const e = arrowEnd(arrow);
      const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
      const n = { x: (s.y - e.y) / len, y: (e.x - s.x) / len };
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      let bend = (p.x - mid.x) * n.x + (p.y - mid.y) * n.y;
      if (Math.abs(bend) * zoom < STRAIGHT_SNAP) bend = 0;
      next = { ...arrow, bend };
    } else {
      const other = state.point === 'start' ? arrow.end : arrow.start;
      const target = bindTargetAt(ctx.scene, p, 4 / zoom, other?.elementId);
      state.target = target?.id ?? null;
      const binding = bindingFor(target, p);
      next =
        state.point === 'start'
          ? { ...withEnds(arrow, p, arrowEnd(arrow)), start: binding }
          : { ...withEnds(arrow, arrowStart(arrow), p), end: binding };
    }
    ctx.preview(new Map([[arrow.id, next]]));
  }

  private drawArrowHandles(g: CanvasRenderingContext2D, arrow: ArrowElement) {
    const zoom = this.ctx.camera.zoom;
    const { accent, handleFill } = this.ctx.colors;
    g.save();
    g.lineWidth = 1.5 / zoom;
    for (const [point, at] of this.arrowPoints(arrow)) {
      const binding = point === 'start' ? arrow.start : point === 'end' ? arrow.end : null;
      const bound = !!binding && !!this.ctx.scene.get(binding.elementId);
      g.beginPath();
      g.arc(
        at.x,
        at.y,
        (point === 'bend' ? ARROW_HANDLE - 1.5 : ARROW_HANDLE) / zoom,
        0,
        Math.PI * 2,
      );
      // Relleno del color de acento: ese extremo está enganchado.
      g.fillStyle = bound ? accent : handleFill;
      g.strokeStyle = accent;
      g.globalAlpha = point === 'bend' ? 0.8 : 1;
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  /** Estado de lo que se va a transformar (lo bloqueado no se mueve). */
  private snapshot(): Changes {
    return new Map(
      this.selectedElements()
        .filter((el) => !el.locked)
        .map((el) => [el.id, el]),
    );
  }

  /**
   * Transforma lo seleccionado. Las flechas que se mueven sin lo que conectan se
   * sueltan de ello (si no, volverían a pegarse a sus elementos).
   */
  private mapOriginals(originals: Changes, fn: (el: SceneElement) => SceneElement): Changes {
    const moving = new Set(originals.keys());
    const changes: Changes = new Map();
    for (const [id, el] of originals) changes.set(id, el && detachMoved(fn(el), moving));
    return changes;
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.ctx.invalidateOverlay();
  }
}

const ratio = (a: number, b: number) => (Math.abs(b) < 1e-9 ? 1 : a / b);

const limitScale = (s: number) => (Math.abs(s) < MIN_SCALE ? (Math.sign(s) || 1) * MIN_SCALE : s);
