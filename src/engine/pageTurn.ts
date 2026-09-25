import { PAGE_HEIGHT, PAGE_WIDTH, type BookSpread } from './book';
import type { SceneElement } from './elements';
import type { Vec } from './math';

/** A double page that can be turned to (with what is needed to draw it). */
export interface TurnTarget {
  id: string;
  elements: SceneElement[];
  book: BookSpread;
}

export type TurnDirection = 1 | -1;

interface Animation {
  from: Vec;
  to: Vec;
  start: number;
  duration: number;
  /** How much the sheet lifts halfway (automatic page turning). */
  lift: number;
  easing: (t: number) => number;
  done?: () => void;
}

interface Curl {
  dir: TurnDirection;
  /** Corner of the sheet being lifted. */
  corner: Vec;
  /** Where that corner is now. */
  point: Vec;
  texture: HTMLCanvasElement;
  mode: 'peel' | 'drag' | 'settle' | 'auto' | 'hold';
  anim: Animation | null;
}

export interface PageTurnerHooks {
  /** Draws a double page on a canvas (both pages, at that scale). */
  renderTexture: (target: TurnTarget, scale: number) => HTMLCanvasElement;
  invalidate: () => void;
  /** The sheet was released past the middle: the page must open. */
  onTurn: (dir: TurnDirection) => void;
}

const W = PAGE_WIDTH;
const H = PAGE_HEIGHT;
const TOP = -H / 2;
const BOTTOM = H / 2;
const DIAGONAL = Math.hypot(W, H);
const PAPER_SHADE = 'rgba(40, 25, 10,';

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Polygon = Vec[];

const pagePolygon = (dir: TurnDirection): Polygon =>
  dir === 1
    ? [
        { x: 0, y: TOP },
        { x: W, y: TOP },
        { x: W, y: BOTTOM },
        { x: 0, y: BOTTOM },
      ]
    : [
        { x: -W, y: TOP },
        { x: 0, y: TOP },
        { x: 0, y: BOTTOM },
        { x: -W, y: BOTTOM },
      ];

/** Part of the polygon on one side of the line through P with normal n. */
function clipHalf(poly: Polygon, p: Vec, n: Vec, side: 1 | -1): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = side * ((a.x - p.x) * n.x + (a.y - p.y) * n.y);
    const db = side * ((b.x - p.x) * n.x + (b.y - p.y) * n.y);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Polygon) {
  ctx.beginPath();
  poly.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}

/**
 * Turning pages like in a notebook: the sheet's corner follows the mouse and the sheet
 * folds along the line between the corner and the mouse. The lifted part reveals the page
 * underneath and shows the other side behind it. All in world coordinates (the spine is
 * at x = 0), so it works at any zoom.
 */
export class PageTurner {
  private targets: { prev: TurnTarget | null; next: TurnTarget | null } = {
    prev: null,
    next: null,
  };
  private readonly textures = new Map<TurnTarget, HTMLCanvasElement>();
  private curl: Curl | null = null;
  private textureScale = 1;

  constructor(private readonly hooks: PageTurnerHooks) {}

  /** Pages that can be turned to by dragging the corner. */
  setTargets(prev: TurnTarget | null, next: TurnTarget | null) {
    this.targets = { prev, next };
    this.clearTextures();
  }

  /** The neighbouring pages are drawn again (e.g. when the theme changes). */
  clearTextures() {
    this.textures.clear();
  }

  /** There is a sheet lifted or moving. */
  get active(): boolean {
    return this.curl !== null;
  }

  /** Turning the page by itself (or waiting for the new one to load): it can't be touched. */
  get busy(): boolean {
    const mode = this.curl?.mode;
    return mode === 'auto' || mode === 'hold' || mode === 'settle';
  }

  get dragging(): boolean {
    return this.curl?.mode === 'drag';
  }

  /** Resolution of the neighbouring pages (the current zoom's, within limits). */
  setScale(pixelScale: number) {
    this.textureScale = Math.min(2, Math.max(0.5, pixelScale));
  }

  /** Corner that can be grabbed at that point, or null. */
  cornerAt(p: Vec, zoom: number): { dir: TurnDirection; corner: Vec } | null {
    // About 56 screen px, but always inside the sheet.
    const reach = Math.min(W * 0.25, Math.max(60, 56 / zoom));
    const sides: [TurnDirection, number, TurnTarget | null][] = [
      [1, W, this.targets.next],
      [-1, -W, this.targets.prev],
    ];
    for (const [dir, x, target] of sides) {
      if (!target) continue;
      for (const y of [TOP, BOTTOM]) {
        if (Math.abs(p.x - x) < reach && Math.abs(p.y - y) < reach) {
          return { dir, corner: { x, y } };
        }
      }
    }
    return null;
  }

  /**
   * When the mouse gets close to a corner, the sheet lifts a bit. Returns whether there
   * is a corner.
   */
  hover(p: Vec | null, zoom: number): boolean {
    if (this.busy || this.dragging) return false;
    const hit = p ? this.cornerAt(p, zoom) : null;
    const curl = this.curl;
    if (hit) {
      const same = curl?.corner.x === hit.corner.x && curl.corner.y === hit.corner.y;
      // A new corner, or the same one while it was going back: it lifts.
      if (!same || curl?.anim?.done) {
        const texture = this.textureFor(hit.dir);
        if (!texture) return false;
        this.curl = { ...hit, point: { ...hit.corner }, texture, mode: 'peel', anim: null };
        const lift = Math.min(W * 0.14, 70 / zoom);
        this.animate(
          {
            x: hit.corner.x - hit.dir * lift,
            y: hit.corner.y + (hit.corner.y === TOP ? lift : -lift),
          },
          200,
          easeOut,
        );
      }
      return true;
    }
    if (curl?.mode === 'peel' && !curl.anim?.done) {
      this.animate(curl.corner, 200, easeOut, 0, () => this.end());
    }
    return false;
  }

  /** Starts dragging the corner. Returns false if there is no corner there. */
  grab(p: Vec, zoom: number): boolean {
    if (this.busy) return false;
    const hit = this.cornerAt(p, zoom);
    if (!hit) return false;
    const texture = this.textureFor(hit.dir);
    if (!texture) return false;
    const same = this.curl?.corner.x === hit.corner.x && this.curl.corner.y === hit.corner.y;
    this.curl = {
      ...hit,
      point: same ? this.curl!.point : { ...hit.corner },
      texture,
      mode: 'drag',
      anim: null,
    };
    this.drag(p);
    return true;
  }

  drag(p: Vec) {
    const curl = this.curl;
    if (curl?.mode !== 'drag') return;
    curl.point = this.constrain(curl, p);
    this.hooks.invalidate();
  }

  /**
   * On release: if the corner went past the middle, the sheet finishes falling;
   * otherwise, it goes back.
   */
  release() {
    const curl = this.curl;
    if (curl?.mode !== 'drag') return;
    const turned = curl.dir === 1 ? curl.point.x < W * 0.45 : curl.point.x > -W * 0.45;
    curl.mode = 'settle';
    if (turned) {
      this.animate({ x: -curl.dir * W, y: curl.corner.y }, 320, easeOut, 0, () => {
        curl.mode = 'hold';
        this.hooks.onTurn(curl.dir);
      });
    } else {
      this.animate(curl.corner, 260, easeOut, 0, () => this.end());
    }
  }

  /** Releases the sheet without turning the page (e.g. if the pointer is lost). */
  cancel() {
    if (this.curl?.mode === 'drag') {
      this.curl.mode = 'settle';
      this.animate(this.curl.corner, 200, easeOut, 0, () => this.end());
    }
  }

  /**
   * Turns the page by itself (keyboard, buttons, calendar) until `target` shows. The
   * sheet stays down until end() is called with the new page already loaded.
   */
  turn(dir: TurnDirection, target: TurnTarget, duration = 720): Promise<void> {
    const texture = this.hooks.renderTexture(target, this.textureScale);
    const corner = { x: dir * W, y: BOTTOM };
    const current = this.curl;
    const point = current?.dir === dir && current.corner.y === BOTTOM ? current.point : corner;
    this.curl = { dir, corner, point: { ...point }, texture, mode: 'auto', anim: null };
    return new Promise((resolve) => {
      this.animate({ x: -dir * W, y: BOTTOM }, duration, easeInOut, H * 0.16, () => {
        if (this.curl) this.curl.mode = 'hold';
        resolve();
      });
    });
  }

  end() {
    if (!this.curl) return;
    this.curl = null;
    this.hooks.invalidate();
  }

  /** Advances the animation. Returns true while it keeps moving. */
  step(now: number): boolean {
    const curl = this.curl;
    const anim = curl?.anim;
    if (!curl || !anim) return false;
    const t = Math.min(1, (now - anim.start) / anim.duration);
    const e = anim.easing(t);
    const p = {
      x: anim.from.x + (anim.to.x - anim.from.x) * e,
      y: anim.from.y + (anim.to.y - anim.from.y) * e - anim.lift * Math.sin(Math.PI * e),
    };
    curl.point = this.constrain(curl, p);
    if (t < 1) return true;
    curl.anim = null;
    anim.done?.();
    return false;
  }

  /**
   * Draws the lifted sheet over the current page (world coordinates). `underLeaf` paints
   * what goes between the page underneath and the sheet (the rings).
   */
  draw(ctx: CanvasRenderingContext2D, pixelScale: number, underLeaf?: () => void) {
    const curl = this.curl;
    if (!curl) return;
    const { corner: c, point: m, texture } = curl;
    const dx = c.x - m.x;
    const dy = c.y - m.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    // n: from the lifted corner towards its place; P: point on the fold; d: direction of
    // the fold.
    const n = { x: dx / len, y: dy / len };
    const p = { x: (c.x + m.x) / 2, y: (c.y + m.y) / 2 };
    const d = { x: -n.y, y: n.x };
    const lifted = clipHalf(pagePolygon(curl.dir), p, n, 1);
    if (lifted.length < 3) return;
    const drawPages = () => ctx.drawImage(texture, -W, TOP, W * 2, H);
    // How far the corner still is from landing on the other side (measured to that point,
    // not by distance travelled: when turning by itself the sheet stays lifted almost to
    // the end). The shadows and the highlight fade out as it lands, so the sheet lands
    // exactly like the new page.
    const toEnd = Math.hypot(m.x + curl.dir * W, m.y - c.y);
    const shade = Math.min(1, toEnd / (W * 0.3));
    // The rings go under the lifted sheet and only show above it in the last millimetres,
    // when the sheet is already flat (like going through the rings).
    const ringsOver = 1 - Math.min(1, toEnd / (W * 0.06));
    const huge = () => ctx.fillRect(-W * 2, TOP - H, W * 4, H * 3);

    // What is uncovered: the page underneath, with the sheet's shadow.
    ctx.save();
    tracePolygon(ctx, lifted);
    ctx.clip();
    drawPages();
    const shadow = ctx.createLinearGradient(p.x, p.y, p.x + n.x * 150, p.y + n.y * 150);
    shadow.addColorStop(0, `${PAPER_SHADE} ${0.3 * shade})`);
    shadow.addColorStop(1, `${PAPER_SHADE} 0)`);
    ctx.fillStyle = shadow;
    huge();
    ctx.restore();
    underLeaf?.();

    // The folded sheet: the lifted part mirrored on the fold.
    const reflect = (q: Vec): Vec => {
      const vx = q.x - p.x;
      const vy = q.y - p.y;
      const along = vx * d.x + vy * d.y;
      return { x: p.x + 2 * along * d.x - vx, y: p.y + 2 * along * d.y - vy };
    };
    const flap = lifted.map(reflect);
    ctx.save();
    ctx.shadowColor = `${PAPER_SHADE} ${0.35 * shade})`;
    ctx.shadowBlur = 48 * pixelScale;
    tracePolygon(ctx, flap);
    ctx.fillStyle = '#fdfbf5';
    ctx.fill();
    ctx.restore();

    // Behind it the other side shows: the page on the other side of the spine, mirrored
    // twice (on the spine and on the fold), which is a rotation: it reads the right way
    // round.
    const r00 = 2 * d.x * d.x - 1;
    const r01 = 2 * d.x * d.y;
    const r11 = 2 * d.y * d.y - 1;
    const vx = -p.x;
    const vy = -p.y;
    ctx.save();
    tracePolygon(ctx, flap);
    ctx.clip();
    ctx.save();
    ctx.transform(-r00, -r01, r01, r11, p.x + r00 * vx + r01 * vy, p.y + r01 * vx + r11 * vy);
    drawPages();
    ctx.restore();
    const reach = Math.min(len / 2, 350) + 55;
    const gloss = ctx.createLinearGradient(p.x, p.y, p.x - n.x * reach, p.y - n.y * reach);
    gloss.addColorStop(0, `${PAPER_SHADE} ${0.22 * shade})`);
    gloss.addColorStop(0.3, `rgba(255, 255, 255, ${0.14 * shade})`);
    gloss.addColorStop(1, `${PAPER_SHADE} ${0.06 * shade})`);
    ctx.fillStyle = gloss;
    huge();
    ctx.restore();
    if (ringsOver > 0 && underLeaf) {
      ctx.save();
      ctx.globalAlpha = ringsOver;
      underLeaf();
      ctx.restore();
    }
  }

  private textureFor(dir: TurnDirection): HTMLCanvasElement | null {
    const target = dir === 1 ? this.targets.next : this.targets.prev;
    if (!target) return null;
    let texture = this.textures.get(target);
    if (!texture) {
      texture = this.hooks.renderTexture(target, this.textureScale);
      this.textures.set(target, texture);
    }
    return texture;
  }

  /**
   * The sheet can't separate from the spine (the corner can't get further than its
   * length) or stretch outwards: the corner never leaves the sheet. If it did, the fold
   * would end up outside and it would look like the whole page lifts.
   */
  private constrain(curl: Curl, p: Vec): Vec {
    const cy = curl.corner.y;
    p = {
      x: curl.dir === 1 ? Math.min(p.x, W - 0.5) : Math.max(p.x, -W + 0.5),
      y: cy === TOP ? Math.max(p.y, TOP + 0.5) : Math.min(p.y, BOTTOM - 0.5),
    };
    const near = { x: 0, y: cy };
    const far = { x: 0, y: cy === TOP ? BOTTOM : TOP };
    let q = { ...p };
    for (const [anchor, max] of [
      [near, W],
      [far, DIAGONAL],
    ] as const) {
      const dist = Math.hypot(q.x - anchor.x, q.y - anchor.y);
      if (dist > max) {
        q = {
          x: anchor.x + ((q.x - anchor.x) * max) / dist,
          y: anchor.y + ((q.y - anchor.y) * max) / dist,
        };
      }
    }
    return q;
  }

  private animate(
    to: Vec,
    duration: number,
    easing: (t: number) => number,
    lift = 0,
    done?: () => void,
  ) {
    const curl = this.curl;
    if (!curl) return;
    curl.anim = {
      from: { ...curl.point },
      to,
      start: performance.now(),
      duration,
      lift,
      easing,
      done,
    };
    this.hooks.invalidate();
  }
}
