import { PAGE_HEIGHT, PAGE_WIDTH, type BookSpread } from './book';
import type { SceneElement } from './elements';
import type { Vec } from './math';

/** Una doble página a la que se puede pasar (con lo necesario para dibujarla). */
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
  /** Cuánto se levanta la hoja a mitad del recorrido (pasar página automático). */
  lift: number;
  easing: (t: number) => number;
  done?: () => void;
}

interface Curl {
  dir: TurnDirection;
  /** Esquina de la hoja que se levanta. */
  corner: Vec;
  /** Dónde está ahora esa esquina. */
  point: Vec;
  texture: HTMLCanvasElement;
  mode: 'peel' | 'drag' | 'settle' | 'auto' | 'hold';
  anim: Animation | null;
}

export interface PageTurnerHooks {
  /** Dibuja una doble página en un canvas (las dos páginas, a esa escala). */
  renderTexture: (target: TurnTarget, scale: number) => HTMLCanvasElement;
  invalidate: () => void;
  /** La hoja se ha soltado pasada la mitad: hay que abrir la página. */
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

/** Parte del polígono a un lado de la recta que pasa por P con normal n. */
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
 * Pasar página como en un cuaderno: la esquina de la hoja sigue al ratón y la hoja se
 * dobla por la línea que queda entre la esquina y el ratón. La parte levantada deja ver
 * la página de debajo y muestra por detrás la otra cara. Todo en coordenadas del mundo
 * (el lomo está en x = 0), así funciona con cualquier zoom.
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

  /** Páginas a las que se puede pasar arrastrando la esquina. */
  setTargets(prev: TurnTarget | null, next: TurnTarget | null) {
    this.targets = { prev, next };
    this.clearTextures();
  }

  /** Se vuelven a dibujar las páginas de al lado (p. ej. al cambiar el tema). */
  clearTextures() {
    this.textures.clear();
  }

  /** Hay una hoja levantada o moviéndose. */
  get active(): boolean {
    return this.curl !== null;
  }

  /** Pasando página solo (o esperando a que cargue la nueva): no se puede tocar. */
  get busy(): boolean {
    const mode = this.curl?.mode;
    return mode === 'auto' || mode === 'hold' || mode === 'settle';
  }

  get dragging(): boolean {
    return this.curl?.mode === 'drag';
  }

  /** Resolución de las páginas de al lado (la del zoom actual, con límites). */
  setScale(pixelScale: number) {
    this.textureScale = Math.min(2, Math.max(0.5, pixelScale));
  }

  /** Esquina que se puede agarrar en ese punto, o null. */
  cornerAt(p: Vec, zoom: number): { dir: TurnDirection; corner: Vec } | null {
    // Unos 56 px de pantalla, pero siempre dentro de la hoja.
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

  /** Al acercar el ratón a una esquina, la hoja se levanta un poco. Devuelve si hay esquina. */
  hover(p: Vec | null, zoom: number): boolean {
    if (this.busy || this.dragging) return false;
    const hit = p ? this.cornerAt(p, zoom) : null;
    const curl = this.curl;
    if (hit) {
      const same = curl?.corner.x === hit.corner.x && curl.corner.y === hit.corner.y;
      // Nueva esquina, o la misma mientras volvía a su sitio: se levanta.
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

  /** Empieza a arrastrar la esquina. Devuelve false si ahí no hay esquina. */
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

  /** Al soltar: si la esquina pasó de la mitad, la hoja termina de caer; si no, vuelve. */
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

  /** Suelta la hoja sin pasar página (p. ej. si se pierde el puntero). */
  cancel() {
    if (this.curl?.mode === 'drag') {
      this.curl.mode = 'settle';
      this.animate(this.curl.corner, 200, easeOut, 0, () => this.end());
    }
  }

  /**
   * Pasa página sola (teclado, botones, calendario) hasta mostrar `target`. La hoja se
   * queda caída hasta que se llama a end() con la nueva página ya cargada.
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

  /** Avanza la animación. Devuelve true mientras siga moviéndose. */
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
   * Dibuja la hoja levantada encima de la página actual (coordenadas del mundo).
   * `underLeaf` pinta lo que va entre la página de debajo y la hoja (las anillas).
   */
  draw(ctx: CanvasRenderingContext2D, pixelScale: number, underLeaf?: () => void) {
    const curl = this.curl;
    if (!curl) return;
    const { corner: c, point: m, texture } = curl;
    const dx = c.x - m.x;
    const dy = c.y - m.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    // n: de la esquina levantada hacia su sitio; P: punto del pliegue; d: dirección del pliegue.
    const n = { x: dx / len, y: dy / len };
    const p = { x: (c.x + m.x) / 2, y: (c.y + m.y) / 2 };
    const d = { x: -n.y, y: n.x };
    const lifted = clipHalf(pagePolygon(curl.dir), p, n, 1);
    if (lifted.length < 3) return;
    const drawPages = () => ctx.drawImage(texture, -W, TOP, W * 2, H);
    // Cuánto le falta a la esquina para posarse del otro lado (medido hasta ese punto,
    // no por lo recorrido: al pasar sola la hoja va levantada casi hasta el final).
    // Las sombras y el brillo se desvanecen al posarse, así la hoja aterriza igual que
    // la página nueva.
    const toEnd = Math.hypot(m.x + curl.dir * W, m.y - c.y);
    const shade = Math.min(1, toEnd / (W * 0.3));
    // Las anillas van bajo la hoja levantada y solo asoman por encima en los últimos
    // milímetros, cuando la hoja ya está plana (como al pasar por las anillas).
    const ringsOver = 1 - Math.min(1, toEnd / (W * 0.06));
    const huge = () => ctx.fillRect(-W * 2, TOP - H, W * 4, H * 3);

    // Lo que queda al descubierto: la página de debajo, con la sombra de la hoja.
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

    // La hoja doblada: la parte levantada reflejada en el pliegue.
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

    // Por detrás se ve la otra cara: la página del otro lado del lomo, reflejada dos
    // veces (en el lomo y en el pliegue), que es un giro: se lee al derecho.
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
   * La hoja no se puede separar del lomo (la esquina no llega más lejos que su largo)
   * ni estirarse hacia fuera: la esquina nunca sale de la hoja. Si saliera, el pliegue
   * quedaría fuera y parecería que se levanta la página entera.
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
