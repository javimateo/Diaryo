import { coverGrain, GRAIN_SCALE, KRAFT_COLOR, shade, type CoverMaterial } from './cover';
import type { DeskStyle } from './desk';
import type { Bounds } from './geometry';
import type { ThemeMode } from './palette';

export type PaperStyle = 'lines' | 'grid' | 'dots' | 'plain' | 'cornell' | 'planner' | 'isometric';

/** Tipos de hoja, en el orden en que se ofrecen. */
export const PAPERS: Record<PaperStyle, string> = {
  lines: 'Rayas',
  grid: 'Cuadrícula',
  dots: 'Puntos',
  plain: 'Lisa',
  cornell: 'Cornell',
  planner: 'Agenda',
  isometric: 'Isométrica',
};

export const isPaperStyle = (value: unknown): value is PaperStyle =>
  typeof value === 'string' && Object.hasOwn(PAPERS, value);
export type Binding = 'rings' | 'sewn';
export type PaperColor = 'cream' | 'white' | 'yellow' | 'pink' | 'blue' | 'green' | 'kraft';

/** Colores de hoja: el de día y su versión "de noche" (tema oscuro). */
export const PAPER_COLORS: Record<PaperColor, { name: string; light: string; dark: string }> = {
  cream: { name: 'Crema', light: '#fdfbf5', dark: '#25241f' },
  white: { name: 'Blanco', light: '#ffffff', dark: '#262626' },
  yellow: { name: 'Amarillo', light: '#fbf3cf', dark: '#2c2a1d' },
  pink: { name: 'Rosa', light: '#fbe6e4', dark: '#2e2324' },
  blue: { name: 'Azul', light: '#e6effa', dark: '#1f2530' },
  green: { name: 'Verde', light: '#e7f2e2', dark: '#212a22' },
  kraft: { name: 'Kraft', light: '#e4d1ad', dark: '#2d271d' },
};

/** Aspecto del diario. La hoja es la de todo el diario, salvo en las páginas que tengan otra. */
export interface BookStyle {
  paper: PaperStyle;
  paperColor: PaperColor;
  binding: Binding;
  /** Color de las tapas. */
  cover: string;
  material: CoverMaterial;
  /** Goma elástica en la tapa de atrás (asoma arriba y abajo). */
  elastic: boolean;
  /** La mesa sobre la que está el diario. */
  desk: DeskStyle;
}

/** Pestaña de una página marcada como importante. */
export interface BookTab {
  pageId: string;
  label: string;
  color: string;
  /** Asoma por la izquierda (página anterior) o por la derecha (siguiente o abierta). */
  side: 'left' | 'right';
  /** Es la página abierta. */
  current: boolean;
}

/** La doble página abierta: un día del diario. */
export interface BookSpread {
  style: BookStyle;
  /** Fecha escrita a mano arriba de la página izquierda. */
  date: string;
  /** Título de la página, arriba de la derecha. */
  title: string;
  today: boolean;
  /** Número de la página izquierda (la derecha es el siguiente). */
  pageNumber: number;
  /** Pestañas de las páginas importantes, en el orden del diario. */
  tabs: BookTab[];
}

/** Tamaño de cada página en unidades del mundo (proporción parecida a A5). */
export const PAGE_WIDTH = 760;
export const PAGE_HEIGHT = 1040;
const TOP = -PAGE_HEIGHT / 2;
const BOTTOM = PAGE_HEIGHT / 2;
/** Canto de hojas que asoma bajo cada página, y en cuántas rayas se ve. */
const BLOCK = 8;
const BLOCK_LINES = 6;
/** Lo que sobresalen las tapas más allá del canto de las hojas. */
const COVER_MARGIN = 16;
const COVER_OUT = BLOCK + COVER_MARGIN;
const COVER_RADIUS = 18;
/** Grosor de las tapas: su canto asoma por abajo. */
const COVER_THICKNESS = 5;
/** Separación entre las dos tapas en el lomo (con anillas). */
const RING_GAP = 7;
/** Media anchura del lomo de tela (cosido). */
const SPINE_STRIP = 34;
const ELASTIC_WIDTH = 14;
/** Distancia de la goma al canto de fuera de las tapas, y lo que asoma arriba y abajo. */
const ELASTIC_INSET = 34;
const ELASTIC_PEEK = 22;
const RING_COUNT = 14;
const RING_HOLE_X = 24;
const RING_HOLE_RADIUS = 7.5;
const LINE_SPACING = 40;
const FIRST_LINE = TOP + 150;
const GRID_SPACING = 32;
const HAND_FONT = '"Caveat Variable", "Segoe Print", cursive';

export const DEFAULT_BOOK_STYLE: BookStyle = {
  paper: 'lines',
  paperColor: 'cream',
  binding: 'rings',
  cover: '#b8573f',
  material: 'leather',
  elastic: true,
  desk: 'wood',
};

export const COVER_COLORS = ['#b8573f', '#c9677e', '#46699c', '#4f7d5c', '#c99a2e', '#2f2d2a'];

/** Las dos páginas: la izquierda termina en el lomo (x = 0) y la derecha empieza en él. */
export const PAGES = {
  left: { minX: -PAGE_WIDTH, minY: TOP, maxX: 0, maxY: BOTTOM },
  right: { minX: 0, minY: TOP, maxX: PAGE_WIDTH, maxY: BOTTOM },
} satisfies Record<string, Bounds>;

/**
 * ¿Es de la página (está dentro del libro) o de la mesa (fuera, común a todo el
 * diario)? Cuenta el centro del elemento: al sacar algo del libro pasa a la mesa.
 */
export function isOnPage(bounds: Bounds): boolean {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return cx >= -PAGE_WIDTH && cx <= PAGE_WIDTH && cy >= TOP && cy <= BOTTOM;
}

/**
 * Todo el libro abierto, con las tapas (y sitio para las pestañas a los dos lados si
 * hay alguna: así el encuadre no cambia cuando una pestaña se pasa al otro lado).
 */
export function bookBounds(spread?: BookSpread | null): Bounds {
  return bookBoundsWith(!!spread?.tabs.length);
}

/** Todo el libro abierto, con sitio para las pestañas si las hay. */
export function bookBoundsWith(hasTabs: boolean): Bounds {
  const m = COVER_OUT;
  const tabs = hasTabs ? TAB_OUT + TAB_CURRENT_EXTRA : 0;
  return {
    minX: -PAGE_WIDTH - m - tabs,
    minY: TOP - m - ELASTIC_PEEK,
    maxX: PAGE_WIDTH + m + tabs,
    maxY: BOTTOM + m + ELASTIC_PEEK,
  };
}

/** Lo que asoma cada pestaña por fuera de las tapas, su alto y la separación. */
const TAB_OUT = 104;
const TAB_CURRENT_EXTRA = 14;
const TAB_HEIGHT = 74;
const TAB_GAP = 14;
const TAB_TOP = TOP + 40;

export interface TabRect extends Bounds {
  tab: BookTab;
}

/**
 * Dónde va cada pestaña. Todas tienen su hueco fijo en el canto (en el orden del
 * diario), así no se mueven al pasar página: solo cambian de lado. Si no caben, se
 * solapan un poco, como pestañas de verdad.
 */
export function tabRects(spread: BookSpread): TabRect[] {
  const n = spread.tabs.length;
  if (n === 0) return [];
  const room = PAGE_HEIGHT - 80 - TAB_HEIGHT;
  const step = n > 1 ? Math.min(TAB_HEIGHT + TAB_GAP, room / (n - 1)) : 0;
  const edge = PAGE_WIDTH + COVER_OUT;
  return spread.tabs.map((tab, i) => {
    const out = TAB_OUT + (tab.current ? TAB_CURRENT_EXTRA : 0);
    const minY = TAB_TOP + i * step;
    // Empiezan bajo las tapas (se ve solo lo que asoma).
    const inner = PAGE_WIDTH - 40;
    return tab.side === 'right'
      ? { tab, minX: inner, maxX: edge + out, minY, maxY: minY + TAB_HEIGHT }
      : { tab, minX: -edge - out, maxX: -inner, minY, maxY: minY + TAB_HEIGHT };
  });
}

/** Pestaña bajo ese punto (solo la parte que asoma), o null. */
export function tabAt(spread: BookSpread, p: { x: number; y: number }): BookTab | null {
  const edge = PAGE_WIDTH + COVER_OUT;
  for (const r of tabRects(spread).reverse()) {
    const outside = r.tab.side === 'right' ? p.x >= edge : p.x <= -edge;
    if (outside && p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY) {
      return r.tab;
    }
  }
  return null;
}

function drawTabs(ctx: CanvasRenderingContext2D, spread: BookSpread, pixelScale: number) {
  for (const r of tabRects(spread)) {
    const { tab } = r;
    const right = tab.side === 'right';
    ctx.save();
    ctx.shadowColor = 'rgba(40, 25, 10, 0.22)';
    ctx.shadowBlur = 8 * pixelScale;
    ctx.shadowOffsetY = 2 * pixelScale;
    ctx.beginPath();
    // Esquinas de fuera redondeadas, como una pestaña adhesiva.
    const radius = right ? [0, 16, 16, 0] : [16, 0, 0, 16];
    ctx.roundRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY, radius);
    ctx.fillStyle = tab.color;
    ctx.fill();
    ctx.restore();

    // Texto en la parte que asoma, ajustado al hueco.
    const out = TAB_OUT + (tab.current ? TAB_CURRENT_EXTRA : 0) - 18;
    ctx.font = `600 30px ${HAND_FONT}`;
    let label = tab.label;
    while (label.length > 1 && ctx.measureText(label).width > out) {
      label = label.slice(0, -2) + '…';
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = right ? r.maxX - (out + 18) / 2 : r.minX + (out + 18) / 2;
    ctx.fillText(label, cx, (r.minY + r.maxY) / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

interface Colors {
  paper: string;
  sheet: [string, string];
  /** Agujeros de las anillas. */
  hole: string;
  line: string;
  /** Líneas que separan zonas (Cornell, agenda). */
  divider: string;
  margin: string;
  pencil: string;
  ink: string;
}

const COLORS: Record<ThemeMode, Colors> = {
  light: {
    paper: '#fdfbf5',
    sheet: ['#efe8d9', '#e4dac5'],
    hole: '#b9ad97',
    line: 'rgba(80, 110, 160, 0.24)',
    divider: 'rgba(80, 110, 160, 0.5)',
    margin: 'rgba(215, 95, 95, 0.42)',
    pencil: '#a0957f',
    ink: '#2b3242',
  },
  // "Papel de noche": hojas oscuras y tinta clara.
  dark: {
    paper: '#25241f',
    sheet: ['#1d1c18', '#302e28'],
    hole: '#12110f',
    line: 'rgba(170, 190, 230, 0.13)',
    divider: 'rgba(170, 190, 230, 0.3)',
    margin: 'rgba(230, 110, 110, 0.32)',
    pencil: '#7c766a',
    ink: '#e6e2d8',
  },
};

/** Grosor de línea: el del papel, pero nunca menos de un píxel físico. */
const hairline = (world: number, pixelScale: number) => Math.max(world, 1 / pixelScale);

/**
 * Dibuja el libro abierto bajo el contenido: tapas, grosor de hojas, papel con su
 * pauta, la fecha escrita a mano y los números de página. Coordenadas del mundo.
 */
export function drawBook(
  ctx: CanvasRenderingContext2D,
  spread: BookSpread,
  mode: ThemeMode,
  pixelScale: number,
  pagesOnly = false,
) {
  const c = COLORS[mode];
  const { style } = spread;

  if (!pagesOnly) {
    // Las pestañas y la goma salen de debajo de las tapas.
    drawTabs(ctx, spread, pixelScale);
    if (style.elastic) drawElastic(ctx, pixelScale);
    drawCovers(ctx, style, mode, pixelScale);
    drawPageBlock(ctx, c);
  }

  const colors = colorsFor(mode, style.paperColor);
  for (const side of ['left', 'right'] as const) {
    drawPaper(ctx, side, style.paper, colors, pixelScale);
  }
  if (style.binding === 'rings') drawRingHoles(ctx, colors);
  drawSpineShade(ctx, style, mode);

  // Fecha escrita a mano y título.
  ctx.fillStyle = c.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 54px ${HAND_FONT}`;
  const dateX = -PAGE_WIDTH + 70;
  const dateY = TOP + 100;
  ctx.fillText(spread.date, dateX, dateY);
  if (spread.today) {
    const x = dateX + ctx.measureText(spread.date).width + 22;
    ctx.beginPath();
    ctx.roundRect(x, dateY - 40, 84, 48, 24);
    ctx.fillStyle = '#e9785f';
    ctx.fill();
    ctx.font = `600 36px ${HAND_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('hoy', x + 18, dateY - 5);
  }
  if (spread.title) {
    ctx.font = `600 50px ${HAND_FONT}`;
    ctx.fillStyle = c.ink;
    ctx.fillText(spread.title, 90, dateY, PAGE_WIDTH - 150);
  }

  // Números de página en las esquinas de fuera.
  ctx.font = `400 34px ${HAND_FONT}`;
  ctx.fillStyle = c.pencil;
  ctx.textAlign = 'left';
  ctx.fillText(String(spread.pageNumber), -PAGE_WIDTH + 36, BOTTOM - 30);
  ctx.textAlign = 'right';
  ctx.fillText(String(spread.pageNumber + 1), PAGE_WIDTH - 36, BOTTOM - 30);
  ctx.textAlign = 'left';
}

/** Aro de la goma elástica (va por detrás de la tapa de atrás y asoma arriba y abajo). */
function drawElastic(ctx: CanvasRenderingContext2D, pixelScale: number) {
  const x = PAGE_WIDTH + COVER_OUT - ELASTIC_INSET;
  const top = TOP - COVER_OUT - ELASTIC_PEEK;
  const height = PAGE_HEIGHT + (COVER_OUT + ELASTIC_PEEK) * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(30, 20, 10, 0.3)';
  ctx.shadowBlur = 6 * pixelScale;
  ctx.shadowOffsetY = 2 * pixelScale;
  ctx.fillStyle = '#2b2926';
  ctx.beginPath();
  ctx.roundRect(x - ELASTIC_WIDTH / 2, top, ELASTIC_WIDTH, height, ELASTIC_WIDTH / 2);
  ctx.fill();
  ctx.restore();
  // Tejido de la goma: estrías finas y un brillo a un lado.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let y = top + 3; y < top + height - 3; y += 4) {
    ctx.fillRect(x - ELASTIC_WIDTH / 2 + 1.5, y, ELASTIC_WIDTH - 3, 1.4);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(x - ELASTIC_WIDTH / 2 + 2.5, top + 5, 2, height - 10);
}

const grainPatterns = new WeakMap<
  CanvasRenderingContext2D,
  Map<HTMLCanvasElement, CanvasPattern>
>();

function grainPattern(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement) {
  let patterns = grainPatterns.get(ctx);
  if (!patterns) {
    patterns = new Map();
    grainPatterns.set(ctx, patterns);
  }
  let pattern = patterns.get(texture);
  if (!pattern) {
    pattern = ctx.createPattern(texture, 'repeat') ?? undefined;
    if (!pattern) return null;
    pattern.setTransform(new DOMMatrix([GRAIN_SCALE, 0, 0, GRAIN_SCALE, 0, 0]));
    patterns.set(texture, pattern);
  }
  return pattern;
}

/** Color de las tapas (el cartón lleva el suyo). */
export const coverColor = (style: BookStyle) =>
  style.material === 'kraft' ? KRAFT_COLOR : style.cover;

/**
 * Tapas: con anillas son dos cartones separados en el lomo; cosido, una sola tapa con
 * su lomo de tela. Tienen grosor (su canto, más oscuro, asoma abajo y por fuera), el
 * grano de su material, una luz suave y, si son de cuero, un pespunte en el borde.
 * Proyectan una sombra en dos capas: pegada al libro y difusa.
 */
function drawCovers(
  ctx: CanvasRenderingContext2D,
  style: BookStyle,
  mode: ThemeMode,
  pixelScale: number,
) {
  // Tonos de las tapas (de noche, algo más apagadas, como el resto del diario).
  const night = mode === 'dark' ? 0.78 : 1;
  const tone = (amount: number) => shade(coverColor(style), (1 + amount) * night - 1);
  const color = tone(0);
  const rings = style.binding === 'rings';
  const outer = PAGE_WIDTH + COVER_OUT;
  const top = TOP - COVER_OUT;
  const bottom = BOTTOM + COVER_OUT;
  const r = COVER_RADIUS;
  const boards: { minX: number; maxX: number; radii: number[] }[] = rings
    ? [
        { minX: -outer, maxX: -RING_GAP, radii: [r, 4, 4, r] },
        { minX: RING_GAP, maxX: outer, radii: [4, r, r, 4] },
      ]
    : [{ minX: -outer, maxX: outer, radii: [r, r, r, r] }];
  const trace = (inset = 0, lift = 0) => {
    ctx.beginPath();
    for (const b of boards) {
      ctx.roundRect(
        b.minX + inset,
        top + inset,
        b.maxX - b.minX - inset * 2,
        bottom - top - inset * 2 - lift,
        b.radii.map((v) => Math.max(0, v - inset)),
      );
    }
  };

  // Sombra en dos capas: la difusa y la de contacto.
  const dark = mode === 'dark';
  const tint = dark ? '0, 0, 0' : '50, 32, 15';
  for (const [blur, offset, alpha] of [
    [70, 26, dark ? 0.5 : 0.2],
    [8, 3, dark ? 0.6 : 0.3],
  ]) {
    ctx.save();
    ctx.shadowColor = `rgba(${tint}, ${alpha})`;
    ctx.shadowBlur = blur * pixelScale;
    ctx.shadowOffsetY = offset * pixelScale;
    trace();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // Canto (grosor) y cara de la tapa, un poco levantada.
  trace();
  ctx.fillStyle = tone(-0.32);
  ctx.fill();
  trace(0, COVER_THICKNESS);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.save();
  trace(0, COVER_THICKNESS);
  ctx.clip();
  // Lomo de tela (cosido): una franja algo más oscura con sus pliegues.
  if (!rings) {
    ctx.fillStyle = tone(-0.14);
    ctx.fillRect(-SPINE_STRIP, top, SPINE_STRIP * 2, bottom - top);
    ctx.lineWidth = hairline(2, pixelScale);
    for (const x of [-SPINE_STRIP, SPINE_STRIP]) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + Math.sign(x) * 3, top);
      ctx.lineTo(x + Math.sign(x) * 3, bottom);
      ctx.stroke();
    }
  }
  // Grano del material (se funde de lejos, donde ya no se distingue).
  const grain = coverGrain(style.material);
  const grainAlpha = Math.min(1, Math.max(0, (pixelScale * GRAIN_SCALE - 0.35) / 0.4));
  const pattern = grain && grainAlpha > 0 ? grainPattern(ctx, grain) : null;
  if (pattern) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = grainAlpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(-outer, top, outer * 2, bottom - top);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // Luz suave desde arriba a la izquierda.
  const light = ctx.createLinearGradient(-outer, top, outer * 0.6, bottom);
  light.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
  light.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
  ctx.fillStyle = light;
  ctx.fillRect(-outer, top, outer * 2, bottom - top);
  ctx.restore();

  // Pespunte del cuero, cerca del borde.
  if (style.material === 'leather') {
    const inset = 9;
    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.lineCap = 'round';
    ctx.lineWidth = hairline(2, pixelScale);
    ctx.translate(0, 1.4);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    trace(inset, COVER_THICKNESS);
    ctx.stroke();
    ctx.translate(0, -1.4);
    ctx.strokeStyle = 'rgba(255, 232, 212, 0.45)';
    trace(inset, COVER_THICKNESS);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Canto de las hojas: el bloque de papel bajo cada página, que asoma por fuera y por
 * abajo en rayas muy finas. Siempre igual, así el libro no cambia al pasar página.
 */
function drawPageBlock(ctx: CanvasRenderingContext2D, c: Colors) {
  const step = BLOCK / BLOCK_LINES;
  for (let k = BLOCK_LINES; k > 0; k--) {
    const out = k * step;
    ctx.fillStyle = c.sheet[k % 2];
    ctx.fillRect(-PAGE_WIDTH - out, TOP - out * 0.3, PAGE_WIDTH + out, PAGE_HEIGHT + out * 1.1);
    ctx.fillRect(0, TOP - out * 0.3, PAGE_WIDTH + out, PAGE_HEIGHT + out * 1.1);
  }
}

/** Agujeros de las anillas en el papel (se ve la hoja de debajo). */
function drawRingHoles(ctx: CanvasRenderingContext2D, c: Colors) {
  for (const y of ringPositions()) {
    for (const x of [-RING_HOLE_X, RING_HOLE_X]) {
      // Dentro del agujero, la hoja de debajo en sombra.
      ctx.fillStyle = c.hole;
      ctx.beginPath();
      ctx.arc(x, y, RING_HOLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + 0.5, RING_HOLE_RADIUS - 1, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  }
}

/** Sombra del lomo: la hoja se hunde hacia el centro (mucho más si es cosido). */
function drawSpineShade(ctx: CanvasRenderingContext2D, style: BookStyle, mode: ThemeMode) {
  const sewn = style.binding === 'sewn';
  const width = sewn ? 170 : 80;
  const tint = mode === 'dark' ? '0, 0, 0' : '70, 45, 20';
  const deep = mode === 'dark' ? (sewn ? 0.55 : 0.4) : sewn ? 0.2 : 0.12;
  for (const dir of [-1, 1]) {
    const gradient = ctx.createLinearGradient(0, 0, dir * width, 0);
    gradient.addColorStop(0, `rgba(${tint}, ${deep})`);
    gradient.addColorStop(0.22, `rgba(${tint}, ${deep * 0.35})`);
    // La hoja se levanta un poco antes de aplanarse: un brillo muy leve.
    if (sewn && mode === 'light') gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.06)');
    gradient.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(dir < 0 ? -width : 0, TOP, width, PAGE_HEIGHT);
  }
}

function colorsFor(mode: ThemeMode, paperColor: PaperColor): Colors {
  const paper = PAPER_COLORS[paperColor] ?? PAPER_COLORS.cream;
  return { ...COLORS[mode], paper: paper[mode] };
}

/** Márgenes de las líneas: más cerca del canto de fuera que del lomo. */
const insetsOf = (side: 'left' | 'right'): [number, number] =>
  side === 'left' ? [30, 40] : [40, 30];

/** Líneas horizontales de `from` a `to`. */
function ruled(
  ctx: CanvasRenderingContext2D,
  page: Bounds,
  side: 'left' | 'right',
  from: number,
  to: number,
  spacing: number,
) {
  const [left, right] = insetsOf(side);
  ctx.beginPath();
  for (let y = from; y < to; y += spacing) {
    ctx.moveTo(page.minX + left, y);
    ctx.lineTo(page.maxX - right, y);
  }
  ctx.stroke();
}

const PRINT_FONT = '"Inter Variable", system-ui, sans-serif';

/** Rótulo impreso en la hoja ("RESUMEN", "TAREAS"…), pequeño y en gris. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: Colors) {
  ctx.save();
  ctx.font = `600 15px ${PRINT_FONT}`;
  ctx.letterSpacing = '2px';
  ctx.fillStyle = c.pencil;
  ctx.globalAlpha = 0.8;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Cornell: columna de ideas clave, notas y un resumen abajo. */
function drawCornell(
  ctx: CanvasRenderingContext2D,
  page: Bounds,
  side: 'left' | 'right',
  c: Colors,
  pixelScale: number,
) {
  const [left, right] = insetsOf(side);
  const header = TOP + 128;
  const summary = FIRST_LINE + 16 * LINE_SPACING;
  const cue = page.minX + left + 200;
  ruled(ctx, page, side, FIRST_LINE, page.maxY - 60, LINE_SPACING);
  ctx.strokeStyle = c.divider;
  ctx.lineWidth = hairline(2.4, pixelScale);
  ctx.beginPath();
  ctx.moveTo(page.minX + left, header);
  ctx.lineTo(page.maxX - right, header);
  ctx.moveTo(cue, header);
  ctx.lineTo(cue, summary);
  ctx.moveTo(page.minX + left, summary);
  ctx.lineTo(page.maxX - right, summary);
  ctx.stroke();
  const row = FIRST_LINE + 27;
  label(ctx, 'IDEAS CLAVE', page.minX + left + 12, row, c);
  label(ctx, 'NOTAS', cue + 16, row, c);
  label(ctx, 'RESUMEN', page.minX + left + 12, summary + 27, c);
}

const HOUR_HEIGHT = 50;
const FIRST_HOUR = 7;
const LAST_HOUR = 22;

/** Agenda: horas a la izquierda; tareas con su casilla y notas a la derecha. */
function drawPlanner(
  ctx: CanvasRenderingContext2D,
  page: Bounds,
  side: 'left' | 'right',
  c: Colors,
  pixelScale: number,
) {
  const [left, right] = insetsOf(side);
  const start = FIRST_LINE;
  const rows = LAST_HOUR - FIRST_HOUR + 1;
  const lineAt = (i: number) => start + i * HOUR_HEIGHT;

  if (side === 'left') {
    const column = page.minX + left + 74;
    // Medias horas, más suaves.
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    for (let i = 0; i < rows; i++) {
      ctx.moveTo(column, lineAt(i) + HOUR_HEIGHT / 2);
      ctx.lineTo(page.maxX - right, lineAt(i) + HOUR_HEIGHT / 2);
    }
    ctx.stroke();
    ctx.restore();
    ruled(ctx, page, side, start, lineAt(rows) + 1, HOUR_HEIGHT);
    ctx.strokeStyle = c.divider;
    ctx.beginPath();
    ctx.moveTo(column, start);
    ctx.lineTo(column, lineAt(rows));
    ctx.stroke();
    ctx.save();
    ctx.font = `500 17px ${PRINT_FONT}`;
    ctx.fillStyle = c.pencil;
    ctx.textAlign = 'right';
    for (let i = 0; i < rows; i++) {
      ctx.fillText(`${FIRST_HOUR + i}:00`, column - 12, lineAt(i) + 22);
    }
    ctx.restore();
    return;
  }

  const tasks = 9;
  ruled(ctx, page, side, start, lineAt(rows) + 1, HOUR_HEIGHT);
  label(ctx, 'TAREAS', page.minX + left + 12, start - 12, c);
  ctx.strokeStyle = c.divider;
  ctx.lineWidth = hairline(2, pixelScale);
  const box = 20;
  for (let i = 0; i < tasks; i++) {
    ctx.beginPath();
    ctx.roundRect(page.minX + left + 20, lineAt(i) + (HOUR_HEIGHT - box) / 2, box, box, 4);
    ctx.stroke();
  }
  ctx.lineWidth = hairline(2.4, pixelScale);
  ctx.beginPath();
  ctx.moveTo(page.minX + left, lineAt(tasks + 1));
  ctx.lineTo(page.maxX - right, lineAt(tasks + 1));
  ctx.stroke();
  label(ctx, 'NOTAS', page.minX + left + 12, lineAt(tasks + 1) + 30, c);
}

function drawPaper(
  ctx: CanvasRenderingContext2D,
  side: 'left' | 'right',
  paper: PaperStyle,
  c: Colors,
  pixelScale: number,
) {
  const page = PAGES[side];
  ctx.fillStyle = c.paper;
  ctx.fillRect(page.minX, page.minY, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.lineWidth = hairline(1.6, pixelScale);
  ctx.strokeStyle = c.line;

  if (paper === 'lines') {
    ruled(ctx, page, side, FIRST_LINE, page.maxY - 60, LINE_SPACING);
    // Margen rojo.
    const x = side === 'left' ? page.minX + 96 : page.minX + 110;
    ctx.strokeStyle = c.margin;
    ctx.beginPath();
    ctx.moveTo(x, page.minY);
    ctx.lineTo(x, page.maxY);
    ctx.stroke();
  } else if (paper === 'grid') {
    ctx.beginPath();
    for (let x = page.minX + GRID_SPACING; x < page.maxX; x += GRID_SPACING) {
      ctx.moveTo(x, page.minY);
      ctx.lineTo(x, page.maxY);
    }
    for (let y = page.minY + GRID_SPACING; y < page.maxY; y += GRID_SPACING) {
      ctx.moveTo(page.minX, y);
      ctx.lineTo(page.maxX, y);
    }
    ctx.stroke();
  } else if (paper === 'dots') {
    const r = hairline(2.2, pixelScale);
    ctx.fillStyle = c.line;
    ctx.beginPath();
    for (let x = page.minX + GRID_SPACING; x < page.maxX; x += GRID_SPACING) {
      for (let y = page.minY + GRID_SPACING; y < page.maxY; y += GRID_SPACING) {
        ctx.rect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.fill();
  } else if (paper === 'isometric') {
    // Puntos en triángulos: cada fila, desplazada media separación.
    const r = hairline(2.2, pixelScale);
    const rowHeight = (GRID_SPACING * Math.sqrt(3)) / 2;
    ctx.fillStyle = c.line;
    ctx.beginPath();
    for (let row = 1; page.minY + row * rowHeight < page.maxY; row++) {
      const y = page.minY + row * rowHeight;
      const shift = row % 2 === 0 ? GRID_SPACING / 2 : 0;
      for (let x = page.minX + GRID_SPACING / 2 + shift; x < page.maxX; x += GRID_SPACING) {
        ctx.rect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.fill();
  } else if (paper === 'cornell') {
    drawCornell(ctx, page, side, c, pixelScale);
  } else if (paper === 'planner') {
    drawPlanner(ctx, page, side, c, pixelScale);
  }
}

const previews = new Map<string, string>();

/**
 * Una página de ese tipo en pequeño (la izquierda; la de la agenda lleva las horas),
 * para elegir la hoja. Se guarda para no volver a dibujarla.
 */
export function paperPreview(
  paper: PaperStyle,
  mode: ThemeMode,
  paperColor: PaperColor,
  width: number,
): string {
  const dpr = window.devicePixelRatio || 1;
  const key = `${paper}/${mode}/${paperColor}/${width}/${dpr}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const scale = (width / PAGE_WIDTH) * dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_WIDTH * scale);
  canvas.height = Math.round(PAGE_HEIGHT * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, PAGE_WIDTH * scale, (PAGE_HEIGHT / 2) * scale);
  drawPaper(ctx, 'left', paper, colorsFor(mode, paperColor), scale);
  const url = canvas.toDataURL();
  previews.set(key, url);
  return url;
}

/** Altura de cada anilla. */
function ringPositions(): number[] {
  const step = (PAGE_HEIGHT - 100) / (RING_COUNT - 1);
  return Array.from({ length: RING_COUNT }, (_, i) => TOP + 50 + i * step);
}

/** Encuadernación por encima del contenido: anillas o costura en el lomo. */
export function drawBinding(ctx: CanvasRenderingContext2D, spread: BookSpread, pixelScale: number) {
  if (spread.style.binding === 'sewn') {
    // Hilo en el pliegue central.
    ctx.strokeStyle = 'rgba(120, 100, 80, 0.55)';
    ctx.lineWidth = hairline(2.2, pixelScale);
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    ctx.moveTo(0, TOP + 40);
    ctx.lineTo(0, BOTTOM - 40);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  ctx.lineCap = 'round';
  for (const y of ringPositions()) {
    // Sombra del aro sobre el papel.
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.2)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(4, y + 4, 26, 15, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // Metal: borde oscuro, cuerpo y un brillo.
    for (const [color, width] of [
      ['#50555d', 10],
      ['#9ba1aa', 6.5],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(0, y - 3, 26, 16, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, y - 5, 23.5, 13.5, 0, Math.PI * 1.18, Math.PI * 1.55);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
