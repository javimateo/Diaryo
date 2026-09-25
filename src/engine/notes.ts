import type { NoteElement } from './elements';
import { resolveNoteColor, type ThemeMode } from './palette';

/** Estilos de post-it (dibujados a mano en el canvas, sin imágenes). */
export type NoteVariant = 'plain' | 'strip' | 'pin' | 'tape' | 'clip' | 'curl';

export const NOTE_VARIANTS: NoteVariant[] = ['plain', 'strip', 'pin', 'tape', 'clip', 'curl'];

export const NOTE_VARIANT_LABELS: Record<NoteVariant, string> = {
  plain: 'Lisa',
  strip: 'Franja adhesiva',
  pin: 'Chincheta',
  tape: 'Celo',
  clip: 'Clip',
  curl: 'Esquina doblada',
};

// ─── Colores ───────────────────────────────────────────────────

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla dos colores hex: t = 0 → a, t = 1 → b. */
function mix(a: string, b: string, t: number, alpha = 1): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgba(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)}, ${alpha})`;
}

// ─── Cuerpo ────────────────────────────────────────────────────

/** Tamaño de la esquina doblada respecto a la anchura. */
const CURL = 0.17;

/** Silueta del papel: cuadrada, o con la esquina inferior derecha levantada. */
function bodyPath(ctx: CanvasRenderingContext2D, el: NoteElement) {
  const { width: w, height: h, variant } = el;
  ctx.beginPath();
  if (variant === 'curl') {
    const c = w * CURL;
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h - c);
    ctx.quadraticCurveTo(w - c * 0.22, h - c * 0.22, w - c, h);
    ctx.lineTo(0, h);
    ctx.closePath();
  } else if (variant === 'plain') {
    ctx.roundRect(0, 0, w, h, w * 0.02);
  } else {
    ctx.rect(0, 0, w, h);
  }
}

/**
 * Papel con sombra y un degradado muy suave (más claro arriba), como la luz sobre un
 * post-it real. La sombra no sigue la transformación del canvas: se escala a mano.
 */
export function drawNoteBody(
  ctx: CanvasRenderingContext2D,
  el: NoteElement,
  mode: ThemeMode,
  pixelScale: number,
) {
  const { width: w, height: h } = el;
  const base = resolveNoteColor(el.color, mode);

  ctx.save();
  ctx.shadowColor = mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(60, 45, 10, 0.22)';
  ctx.shadowBlur = Math.min(w * 0.06 * pixelScale, 120);
  ctx.shadowOffsetY = Math.min(w * 0.015 * pixelScale, 30);
  const paper = ctx.createLinearGradient(0, 0, w * 0.35, h);
  paper.addColorStop(0, mix(base, '#ffffff', 0.12));
  paper.addColorStop(1, mix(base, '#000000', 0.03));
  ctx.fillStyle = paper;
  bodyPath(ctx, el);
  ctx.fill();
  ctx.restore();

  if (el.variant === 'strip') {
    // La franja adhesiva: algo más clara, con un filo muy fino debajo.
    const band = w * 0.13;
    ctx.fillStyle = mix(base, '#ffffff', 0.28, 0.6);
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = mix(base, '#000000', 0.08, 0.5);
    ctx.fillRect(0, band, w, w * 0.004);
  }
}

// ─── Adornos (encima del texto) ────────────────────────────────

export function drawNoteDecoration(
  ctx: CanvasRenderingContext2D,
  el: NoteElement,
  mode: ThemeMode,
  pixelScale: number,
) {
  switch (el.variant) {
    case 'pin':
      drawPin(ctx, el.width, pixelScale);
      return;
    case 'tape':
      drawTape(ctx, el.width, mode);
      return;
    case 'clip':
      drawClip(ctx, el.width, pixelScale);
      return;
    case 'curl':
      drawCurl(ctx, el, mode, pixelScale);
      return;
  }
}

function drawPin(ctx: CanvasRenderingContext2D, w: number, pixelScale: number) {
  const cx = w * 0.5;
  const cy = w * 0.065;
  const r = w * 0.052;
  ctx.save();
  // Aguja clavada: una línea corta hacia abajo a la derecha.
  ctx.strokeStyle = '#9aa0a6';
  ctx.lineWidth = w * 0.009;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.9, cy + r * 1.35);
  ctx.stroke();
  // Cabeza con sombra y brillo.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = Math.min(r * 0.8 * pixelScale, 40);
  ctx.shadowOffsetX = Math.min(r * 0.35 * pixelScale, 12);
  ctx.shadowOffsetY = Math.min(r * 0.45 * pixelScale, 14);
  const head = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  head.addColorStop(0, '#ff8a8a');
  head.addColorStop(0.45, '#e5383b');
  head.addColorStop(1, '#a4161a');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTape(ctx: CanvasRenderingContext2D, w: number, mode: ThemeMode) {
  const tw = w * 0.36;
  const th = w * 0.11;
  const teeth = 5;
  const depth = th * 0.1;
  ctx.save();
  ctx.translate(w / 2, 0);
  ctx.rotate(-0.045);
  // Rectángulo con los extremos dentados, como celo cortado a mano.
  ctx.beginPath();
  ctx.moveTo(-tw / 2, -th / 2);
  ctx.lineTo(tw / 2, -th / 2);
  for (let i = 1; i <= teeth; i++) {
    const y = -th / 2 + (th * i) / teeth;
    ctx.lineTo(tw / 2 + (i % 2 ? depth : 0), y);
  }
  ctx.lineTo(-tw / 2, th / 2);
  for (let i = teeth - 1; i >= 0; i--) {
    const y = -th / 2 + (th * i) / teeth;
    ctx.lineTo(-tw / 2 - (i % 2 ? depth : 0), y);
  }
  ctx.closePath();
  // Celo algo mate y azulado, con sombra: se distingue sobre cualquier color de nota.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = w * 0.012;
  ctx.shadowOffsetY = w * 0.004;
  ctx.fillStyle = mode === 'dark' ? 'rgba(200, 212, 225, 0.62)' : 'rgba(214, 226, 238, 0.86)';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(70, 90, 120, 0.28)';
  ctx.lineWidth = w * 0.004;
  ctx.stroke();
  // Brillo del plástico.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(-tw / 2, -th / 2 + th * 0.18, tw, th * 0.16);
  ctx.restore();
}

/** Clip metálico cruzando el borde superior, cerca de la esquina derecha. */
function drawClip(ctx: CanvasRenderingContext2D, w: number, pixelScale: number) {
  const W = w * 0.075;
  const L = w * 0.3;
  const a = W * 0.24;
  const inner = (W - 2 * a) / 2;
  const top = (W - a) / 2;
  const outer = W / 2;
  ctx.save();
  ctx.translate(w * 0.74, -L * 0.3);
  ctx.rotate(0.06);
  // Un solo alambre con tres curvas, como un clip de verdad.
  const wire = new Path2D();
  wire.moveTo(a, L * 0.34);
  wire.lineTo(a, L - inner - a);
  wire.arc(W / 2, L - inner - a, inner, Math.PI, 0, true);
  wire.lineTo(W - a, top);
  wire.arc((W - a) / 2, top, top, 0, Math.PI, true);
  wire.lineTo(0, L - outer);
  wire.arc(W / 2, L - outer, outer, Math.PI, 0, true);
  wire.lineTo(W, L * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = Math.min(W * 0.25 * pixelScale, 12);
  ctx.shadowOffsetX = Math.min(W * 0.12 * pixelScale, 6);
  ctx.shadowOffsetY = Math.min(W * 0.18 * pixelScale, 8);
  ctx.strokeStyle = '#8d949c';
  ctx.lineWidth = W * 0.16;
  ctx.stroke(wire);
  ctx.shadowColor = 'transparent';
  const metal = ctx.createLinearGradient(0, 0, W, 0);
  metal.addColorStop(0, '#f5f7fa');
  metal.addColorStop(0.5, '#c3c9d0');
  metal.addColorStop(1, '#eef1f4');
  ctx.strokeStyle = metal;
  ctx.lineWidth = W * 0.09;
  ctx.stroke(wire);
  ctx.restore();
}

/** Esquina inferior derecha levantada: se ve el dorso del papel y su sombra. */
function drawCurl(
  ctx: CanvasRenderingContext2D,
  el: NoteElement,
  mode: ThemeMode,
  pixelScale: number,
) {
  const { width: w, height: h } = el;
  const c = w * CURL;
  const base = resolveNoteColor(el.color, mode);
  const ax = w;
  const ay = h - c;
  const bx = w - c;
  const by = h;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(w - c * 0.22, h - c * 0.22, bx, by);
  ctx.quadraticCurveTo(w - c * 0.95, h - c * 0.95, ax, ay);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = Math.min(c * 0.35 * pixelScale, 30);
  ctx.shadowOffsetX = Math.min(-c * 0.08 * pixelScale, 0);
  ctx.shadowOffsetY = Math.min(-c * 0.08 * pixelScale, 0);
  const flap = ctx.createLinearGradient(w - c * 0.2, h - c * 0.2, w - c * 0.7, h - c * 0.7);
  flap.addColorStop(0, mix(base, '#000000', 0.2));
  flap.addColorStop(1, mix(base, '#ffffff', 0.45));
  ctx.fillStyle = flap;
  ctx.fill();
  // Un filo apenas marcado en el pliegue.
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = w * 0.003;
  ctx.stroke();
  ctx.restore();
}
