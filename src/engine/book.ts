import { coverGrain, GRAIN_SCALE, KRAFT_COLOR, shade, type CoverMaterial } from './cover';
import type { DeskStyle } from './desk';
import type { Bounds } from './geometry';
import type { ThemeMode } from './palette';

export type PaperStyle = 'lines' | 'grid' | 'dots' | 'plain' | 'cornell' | 'planner' | 'isometric';

/** Paper types, in the order they are offered. */
export const PAPER_STYLES: PaperStyle[] = [
  'lines',
  'grid',
  'dots',
  'plain',
  'cornell',
  'planner',
  'isometric',
];

export const isPaperStyle = (value: unknown): value is PaperStyle =>
  PAPER_STYLES.includes(value as PaperStyle);

/** Bindings, in the order they are offered. */
export const BINDINGS: Binding[] = ['rings', 'sewn'];
export type Binding = 'rings' | 'sewn';
export type PaperColor = 'cream' | 'white' | 'yellow' | 'pink' | 'blue' | 'green' | 'kraft';

/** Paper colors: the daytime one and its "night" version (dark theme). */
export const PAPER_COLORS: Record<PaperColor, { light: string; dark: string }> = {
  cream: { light: '#fdfbf5', dark: '#25241f' },
  white: { light: '#ffffff', dark: '#262626' },
  yellow: { light: '#fbf3cf', dark: '#2c2a1d' },
  pink: { light: '#fbe6e4', dark: '#2e2324' },
  blue: { light: '#e6effa', dark: '#1f2530' },
  green: { light: '#e7f2e2', dark: '#212a22' },
  kraft: { light: '#e4d1ad', dark: '#2d271d' },
};

/** Diary look. The paper is the whole diary's, except on pages that have their own. */
export interface BookStyle {
  paper: PaperStyle;
  paperColor: PaperColor;
  binding: Binding;
  /** Cover color. */
  cover: string;
  material: CoverMaterial;
  /** Elastic band on the back cover (it shows at the top and bottom). */
  elastic: boolean;
  /** The desk the diary sits on. */
  desk: DeskStyle;
}

/** Tab of a page marked as important. */
export interface BookTab {
  pageId: string;
  label: string;
  color: string;
  /** It sticks out on the left (previous page) or on the right (next or open one). */
  side: 'left' | 'right';
  /** It is the open page. */
  current: boolean;
}

/**
 * What is written on the book besides each page's content: today's label and the printed
 * labels of the Cornell and Planner papers. They arrive already in the app language.
 */
export interface BookLabels {
  today: string;
  cues: string;
  notes: string;
  summary: string;
  tasks: string;
}

/** The open double page: a diary day. */
export interface BookSpread {
  style: BookStyle;
  /** Handwritten date at the top of the left page. */
  date: string;
  /** Page title, at the top of the right one. */
  title: string;
  today: boolean;
  /** Number of the left page (the right one is the next). */
  pageNumber: number;
  /** Tabs of the important pages, in diary order. */
  tabs: BookTab[];
  labels: BookLabels;
}

/** Size of each page in world units (proportions similar to A5). */
export const PAGE_WIDTH = 760;
export const PAGE_HEIGHT = 1040;
const TOP = -PAGE_HEIGHT / 2;
const BOTTOM = PAGE_HEIGHT / 2;
/** Edge of the sheets showing under each page, and in how many lines it shows. */
const BLOCK = 8;
const BLOCK_LINES = 6;
/** How far the covers stick out beyond the edge of the sheets. */
const COVER_MARGIN = 16;
const COVER_OUT = BLOCK + COVER_MARGIN;
const COVER_RADIUS = 18;
/** Cover thickness: its edge shows at the bottom. */
const COVER_THICKNESS = 5;
/** Gap between the two covers at the spine (with rings). */
const RING_GAP = 7;
/** Half width of the cloth spine (sewn). */
const SPINE_STRIP = 34;
const ELASTIC_WIDTH = 14;
/**
 * Distance from the elastic to the outer edge of the covers, and how much it shows at the
 * top and bottom.
 */
const ELASTIC_INSET = 34;
const ELASTIC_PEEK = 22;
const RING_COUNT = 14;
const RING_HOLE_X = 24;
const RING_HOLE_RADIUS = 7.5;
const LINE_SPACING = 40;
const FIRST_LINE = TOP + 150;
const GRID_SPACING = 32;
const HAND_FONT = '"Caveat Variable", "Segoe Print", cursive';
/** The "today" label: the brand's terracotta, dark enough for white text. */
const TODAY_COLOR = '#b8573f';

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

/** The two pages: the left one ends at the spine (x = 0) and the right one starts there. */
export const PAGES = {
  left: { minX: -PAGE_WIDTH, minY: TOP, maxX: 0, maxY: BOTTOM },
  right: { minX: 0, minY: TOP, maxX: PAGE_WIDTH, maxY: BOTTOM },
} satisfies Record<string, Bounds>;

/**
 * Does it belong to the page (inside the book) or to the desk (outside, shared by the
 * whole diary)? The element's center counts: taking something out of the book moves it to
 * the desk.
 */
export function isOnPage(bounds: Bounds): boolean {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return cx >= -PAGE_WIDTH && cx <= PAGE_WIDTH && cy >= TOP && cy <= BOTTOM;
}

/**
 * The whole open book, with the covers (and room for the tabs on both sides if there is
 * any: that way the framing doesn't change when a tab moves to the other side).
 */
export function bookBounds(spread?: BookSpread | null): Bounds {
  return bookBoundsWith(!!spread?.tabs.length);
}

/** The whole open book, with room for the tabs if there are any. */
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

/** How far each tab sticks out beyond the covers, its height and the gap. */
const TAB_OUT = 104;
const TAB_CURRENT_EXTRA = 14;
const TAB_HEIGHT = 74;
const TAB_GAP = 14;
const TAB_TOP = TOP + 40;

export interface TabRect extends Bounds {
  tab: BookTab;
}

/**
 * Where each tab goes. They all have their fixed slot on the edge (in diary order), so
 * they don't move when turning pages: they only change sides. If they don't fit, they
 * overlap a little, like real tabs.
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
    // They start under the covers (only the part that sticks out is visible).
    const inner = PAGE_WIDTH - 40;
    return tab.side === 'right'
      ? { tab, minX: inner, maxX: edge + out, minY, maxY: minY + TAB_HEIGHT }
      : { tab, minX: -edge - out, maxX: -inner, minY, maxY: minY + TAB_HEIGHT };
  });
}

/** Tab under that point (only the part that sticks out), or null. */
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
    // Rounded outer corners, like a sticky tab.
    const radius = right ? [0, 16, 16, 0] : [16, 0, 0, 16];
    ctx.roundRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY, radius);
    ctx.fillStyle = tab.color;
    ctx.fill();
    ctx.restore();

    // Text on the part that sticks out, fitted to the slot.
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
  /** Ring holes. */
  hole: string;
  line: string;
  /** Lines separating areas (Cornell, planner). */
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
  // "Night paper": dark sheets and light ink.
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

/** Line width: the paper's, but never less than one physical pixel. */
const hairline = (world: number, pixelScale: number) => Math.max(world, 1 / pixelScale);

/**
 * Draws the open book under the content: covers, sheet thickness, paper with its ruling,
 * the handwritten date and the page numbers. World coordinates.
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
    // The tabs and the elastic come out from under the covers.
    drawTabs(ctx, spread, pixelScale);
    if (style.elastic) drawElastic(ctx, pixelScale);
    drawCovers(ctx, style, mode, pixelScale);
    drawPageBlock(ctx, c);
  }

  const colors = colorsFor(mode, style.paperColor);
  for (const side of ['left', 'right'] as const) {
    drawPaper(ctx, side, style.paper, colors, pixelScale, spread.labels);
  }
  if (style.binding === 'rings') drawRingHoles(ctx, colors);
  drawSpineShade(ctx, style, mode);

  // Handwritten date and title.
  ctx.fillStyle = c.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 54px ${HAND_FONT}`;
  const dateX = -PAGE_WIDTH + 70;
  const dateY = TOP + 100;
  ctx.fillText(spread.date, dateX, dateY);
  if (spread.today) {
    const x = dateX + ctx.measureText(spread.date).width + 22;
    // The label, as wide as its word ("hoy", "today").
    ctx.font = `600 36px ${HAND_FONT}`;
    const width = ctx.measureText(spread.labels.today).width + 36;
    ctx.beginPath();
    ctx.roundRect(x, dateY - 40, width, 48, 24);
    ctx.fillStyle = TODAY_COLOR;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(spread.labels.today, x + 18, dateY - 5);
  }
  if (spread.title) {
    ctx.font = `600 50px ${HAND_FONT}`;
    ctx.fillStyle = c.ink;
    ctx.fillText(spread.title, 90, dateY, PAGE_WIDTH - 150);
  }

  // Page numbers in the outer corners.
  ctx.font = `400 34px ${HAND_FONT}`;
  ctx.fillStyle = c.pencil;
  ctx.textAlign = 'left';
  ctx.fillText(String(spread.pageNumber), -PAGE_WIDTH + 36, BOTTOM - 30);
  ctx.textAlign = 'right';
  ctx.fillText(String(spread.pageNumber + 1), PAGE_WIDTH - 36, BOTTOM - 30);
  ctx.textAlign = 'left';
}

/** Loop of the elastic band (it goes behind the back cover and shows at the top and bottom). */
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
  // Elastic weave: fine ridges and a highlight on one side.
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

/** Cover color (cardboard has its own). */
export const coverColor = (style: BookStyle) =>
  style.material === 'kraft' ? KRAFT_COLOR : style.cover;

/**
 * Covers: with rings they are two boards separated at the spine; sewn, a single cover
 * with its cloth spine. They have thickness (their darker edge shows at the bottom and
 * outside), the grain of their material, a soft light and, if leather, stitching along
 * the border. They cast a two-layer shadow: one close to the book and a diffuse one.
 */
function drawCovers(
  ctx: CanvasRenderingContext2D,
  style: BookStyle,
  mode: ThemeMode,
  pixelScale: number,
) {
  // Cover tones (at night, a bit more muted, like the rest of the diary).
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

  // Two-layer shadow: the diffuse one and the contact one.
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

  // Edge (thickness) and face of the cover, slightly raised.
  trace();
  ctx.fillStyle = tone(-0.32);
  ctx.fill();
  trace(0, COVER_THICKNESS);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.save();
  trace(0, COVER_THICKNESS);
  ctx.clip();
  // Cloth spine (sewn): a slightly darker strip with its folds.
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
  // Material grain (it fades out from afar, where it can no longer be seen).
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
  // Soft light from the top left.
  const light = ctx.createLinearGradient(-outer, top, outer * 0.6, bottom);
  light.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
  light.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
  ctx.fillStyle = light;
  ctx.fillRect(-outer, top, outer * 2, bottom - top);
  ctx.restore();

  // Leather stitching, near the border.
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
 * Edge of the sheets: the block of paper under each page, showing outside and at the
 * bottom in very thin lines. Always the same, so the book doesn't change when turning
 * pages.
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

/** Ring holes in the paper (the sheet underneath shows). */
function drawRingHoles(ctx: CanvasRenderingContext2D, c: Colors) {
  for (const y of ringPositions()) {
    for (const x of [-RING_HOLE_X, RING_HOLE_X]) {
      // Inside the hole, the sheet underneath in shadow.
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

/** Spine shadow: the sheet sinks towards the center (much more if sewn). */
function drawSpineShade(ctx: CanvasRenderingContext2D, style: BookStyle, mode: ThemeMode) {
  const sewn = style.binding === 'sewn';
  const width = sewn ? 170 : 80;
  const tint = mode === 'dark' ? '0, 0, 0' : '70, 45, 20';
  const deep = mode === 'dark' ? (sewn ? 0.55 : 0.4) : sewn ? 0.2 : 0.12;
  for (const dir of [-1, 1]) {
    const gradient = ctx.createLinearGradient(0, 0, dir * width, 0);
    gradient.addColorStop(0, `rgba(${tint}, ${deep})`);
    gradient.addColorStop(0.22, `rgba(${tint}, ${deep * 0.35})`);
    // The sheet rises a little before flattening: a very faint highlight.
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

/** Line margins: closer to the outer edge than to the spine. */
const insetsOf = (side: 'left' | 'right'): [number, number] =>
  side === 'left' ? [30, 40] : [40, 30];

/** Horizontal lines from `from` to `to`. */
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

/** Label printed on the sheet ("SUMMARY", "TASKS"…), small and grey. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: Colors) {
  ctx.save();
  ctx.font = `600 15px ${PRINT_FONT}`;
  ctx.letterSpacing = '2px';
  ctx.fillStyle = c.pencil;
  ctx.globalAlpha = 0.8;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Cornell: cue column, notes and a summary at the bottom. */
function drawCornell(
  ctx: CanvasRenderingContext2D,
  page: Bounds,
  side: 'left' | 'right',
  c: Colors,
  pixelScale: number,
  labels: BookLabels,
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
  label(ctx, labels.cues, page.minX + left + 12, row, c);
  label(ctx, labels.notes, cue + 16, row, c);
  label(ctx, labels.summary, page.minX + left + 12, summary + 27, c);
}

const HOUR_HEIGHT = 50;
const FIRST_HOUR = 7;
const LAST_HOUR = 22;

/** Planner: hours on the left; tasks with their checkbox and notes on the right. */
function drawPlanner(
  ctx: CanvasRenderingContext2D,
  page: Bounds,
  side: 'left' | 'right',
  c: Colors,
  pixelScale: number,
  labels: BookLabels,
) {
  const [left, right] = insetsOf(side);
  const start = FIRST_LINE;
  const rows = LAST_HOUR - FIRST_HOUR + 1;
  const lineAt = (i: number) => start + i * HOUR_HEIGHT;

  if (side === 'left') {
    const column = page.minX + left + 74;
    // Half hours, softer.
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
  label(ctx, labels.tasks, page.minX + left + 12, start - 12, c);
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
  label(ctx, labels.notes, page.minX + left + 12, lineAt(tasks + 1) + 30, c);
}

function drawPaper(
  ctx: CanvasRenderingContext2D,
  side: 'left' | 'right',
  paper: PaperStyle,
  c: Colors,
  pixelScale: number,
  labels: BookLabels,
) {
  const page = PAGES[side];
  ctx.fillStyle = c.paper;
  ctx.fillRect(page.minX, page.minY, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.lineWidth = hairline(1.6, pixelScale);
  ctx.strokeStyle = c.line;

  if (paper === 'lines') {
    ruled(ctx, page, side, FIRST_LINE, page.maxY - 60, LINE_SPACING);
    // Red margin.
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
    // Dots in triangles: each row, shifted half a gap.
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
    drawCornell(ctx, page, side, c, pixelScale, labels);
  } else if (paper === 'planner') {
    drawPlanner(ctx, page, side, c, pixelScale, labels);
  }
}

const previews = new Map<string, string>();

/**
 * A page of that type in small (the left one; the planner's carries the hours), to choose
 * the paper. It is cached so it isn't drawn again.
 */
export function paperPreview(
  paper: PaperStyle,
  mode: ThemeMode,
  paperColor: PaperColor,
  width: number,
  labels: BookLabels,
): string {
  const dpr = window.devicePixelRatio || 1;
  const key = `${paper}/${mode}/${paperColor}/${width}/${dpr}/${labels.notes}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const scale = (width / PAGE_WIDTH) * dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_WIDTH * scale);
  canvas.height = Math.round(PAGE_HEIGHT * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, PAGE_WIDTH * scale, (PAGE_HEIGHT / 2) * scale);
  drawPaper(ctx, 'left', paper, colorsFor(mode, paperColor), scale, labels);
  const url = canvas.toDataURL();
  previews.set(key, url);
  return url;
}

/** Height of each ring. */
function ringPositions(): number[] {
  const step = (PAGE_HEIGHT - 100) / (RING_COUNT - 1);
  return Array.from({ length: RING_COUNT }, (_, i) => TOP + 50 + i * step);
}

/** Binding above the content: rings or stitching on the spine. */
export function drawBinding(ctx: CanvasRenderingContext2D, spread: BookSpread, pixelScale: number) {
  if (spread.style.binding === 'sewn') {
    // Thread in the central fold.
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
    // Ring shadow on the paper.
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.2)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(4, y + 4, 26, 15, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // Metal: dark border, body and a highlight.
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
