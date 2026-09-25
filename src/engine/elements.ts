import { arrowLocalBounds } from './arrowGeometry';
import type { Bounds } from './geometry';
import { rotateVec, type Vec } from './math';
import { DEFAULT_FONT } from './fonts';
import type { NoteVariant } from './notes';
import type { Color, NoteFill } from './palette';

export type StrokeKind = 'pen' | 'marker';
/** Lo que tiene un tamaño ajustable en el panel: grosor de trazo o tamaño de letra. */
export type SizedKind = StrokeKind | 'text';

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Cómo se rellena el fondo de una figura cerrada (como en Excalidraw). */
export type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'dots' | 'zigzag';
export type ShapeKind = 'rect' | 'ellipse';
/** 0 = líneas limpias, 1 = a mano, 2 = muy a mano. */
export type Roughness = 0 | 1 | 2;

/** Texto dentro de una figura (la figura hace de contenedor). Usa el color del trazo. */
export interface Label {
  text: string;
  /** En unidades del mundo. */
  fontSize: number;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
}

export interface StrokeStyle {
  color: Color;
  /**
   * Grosor (o tamaño de letra) en píxeles de pantalla. Al crear se divide por el zoom,
   * así se ve igual en pantalla lo alejado o acercado que estés: puedes escribir en
   * pequeño muy de cerca o títulos gigantes desde lejos.
   */
  size: number;
  /** 0 (invisible) a 1 (opaco). */
  opacity: number;
}

export interface TextStyle extends StrokeStyle {
  font: string;
  align: TextAlign;
}

export interface NoteStyle {
  variant: NoteVariant;
  color: NoteFill;
  /** Color del texto; null = tinta oscura automática. */
  textColor: Color | null;
  /** Tamaño de letra en píxeles de pantalla. */
  size: number;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
  opacity: number;
}

/** Rectángulo y elipse comparten estilo. */
export interface ShapeStyle {
  color: Color;
  border: boolean;
  /** Grosor del trazo en píxeles de pantalla. */
  size: number;
  fill: NoteFill | null;
  fillStyle: FillStyle;
  roughness: Roughness;
  opacity: number;
  font: string;
  /** Tamaño de letra del texto de dentro, en píxeles de pantalla. */
  labelSize: number;
  align: TextAlign;
  valign: VerticalAlign;
}

export type ArrowHead = 'none' | 'arrow';

export interface ArrowStyle {
  color: Color;
  /** Grosor en píxeles de pantalla. */
  size: number;
  roughness: Roughness;
  opacity: number;
  startHead: ArrowHead;
  endHead: ArrowHead;
}

export interface ToolStyles {
  pen: StrokeStyle;
  marker: StrokeStyle;
  text: TextStyle;
  note: NoteStyle;
  shape: ShapeStyle;
  arrow: ArrowStyle;
}

export const DEFAULT_STYLES: ToolStyles = {
  pen: { color: 'ink', size: 4, opacity: 1 },
  marker: { color: 'yellow', size: 20, opacity: 1 },
  text: { color: 'ink', size: 24, opacity: 1, font: DEFAULT_FONT, align: 'left' },
  note: {
    variant: 'plain',
    color: 'yellow',
    textColor: null,
    size: 20,
    font: DEFAULT_FONT,
    align: 'left',
    valign: 'top',
    opacity: 1,
  },
  shape: {
    color: 'ink',
    border: true,
    size: 2,
    fill: null,
    fillStyle: 'hachure',
    roughness: 1,
    opacity: 1,
    font: DEFAULT_FONT,
    labelSize: 20,
    align: 'center',
    valign: 'middle',
  },
  arrow: {
    color: 'ink',
    size: 2,
    roughness: 1,
    opacity: 1,
    startHead: 'none',
    endHead: 'arrow',
  },
};

export interface SizeRange {
  min: number;
  max: number;
  step: number;
  /** Tamaños rápidos del panel. */
  presets: number[];
}

export const SIZE_RANGES: Record<SizedKind, SizeRange> = {
  pen: { min: 1, max: 40, step: 0.5, presets: [2, 4, 8] },
  marker: { min: 4, max: 80, step: 1, presets: [12, 24, 40] },
  text: { min: 8, max: 160, step: 1, presets: [16, 24, 40] },
};

export function clampSize(kind: SizedKind, size: number): number {
  const { min, max, step } = SIZE_RANGES[kind];
  const snapped = Math.round(size / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/** Siguiente tamaño al pulsar + o − (pasos proporcionales: finos en tamaños pequeños). */
export function stepSize(kind: SizedKind, size: number, direction: 1 | -1): number {
  const { step } = SIZE_RANGES[kind];
  const next =
    direction > 0 ? Math.max(size * 1.2, size + step) : Math.min(size / 1.2, size - step);
  return clampSize(kind, next);
}

/** Tamaño de una nota nueva en píxeles de pantalla. */
export const NOTE_SIZE = 220;

interface BaseElement {
  id: string;
  /** Orden de apilado: mayor = encima. */
  z: number;
  /** Origen del elemento en el mundo (esquina superior izquierda en los de tipo caja). */
  x: number;
  y: number;
  /** Giro en radianes alrededor del origen (x, y). */
  rotation: number;
  /** 0 (invisible) a 1 (opaco). */
  opacity: number;
  /** Grupo al que pertenece: se selecciona y se mueve junto con el resto. */
  groupId: string | null;
  /** Bloqueado: no se puede seleccionar, mover ni borrar hasta desbloquearlo. */
  locked: boolean;
  /** Enlace a otra página del diario (su id): lleva una etiqueta que abre esa página. */
  link?: string | null;
}

export interface StrokeElement extends BaseElement {
  type: 'stroke';
  kind: StrokeKind;
  /** Puntos relativos a (x, y), aplanados: [x0, y0, presión0, x1, y1, presión1, …]. */
  points: number[];
  /** Con ratón la presión se simula a partir de la velocidad. */
  simulatePressure: boolean;
  color: Color;
  /** Grosor en unidades del mundo. */
  size: number;
  /** Fondo (solo tiene efecto si el trazo es una figura cerrada). */
  fill: NoteFill | null;
  fillStyle: FillStyle;
  /** Texto dentro (solo en trazos cerrados). */
  label: Label | null;
}

/** Elementos con forma de caja: ocupan [0, width] × [0, height] en sus coordenadas. */
interface BoxElement extends BaseElement {
  width: number;
  height: number;
}

export interface TextElement extends BoxElement {
  type: 'text';
  text: string;
  /** En unidades del mundo. */
  fontSize: number;
  color: Color;
  font: string;
  align: TextAlign;
  /**
   * Caja de ancho fijo: el texto salta de línea al llegar al borde y la caja crece hacia
   * abajo. Si es false, la caja se ajusta a lo escrito (cada línea tan larga como sea).
   */
  wrap: boolean;
}

export interface NoteElement extends BoxElement {
  type: 'note';
  /** Estilo del post-it: liso, con chincheta, celo, clip… */
  variant: NoteVariant;
  text: string;
  fontSize: number;
  color: NoteFill;
  /** Color del texto; null = tinta oscura automática. */
  textColor: Color | null;
  font: string;
  align: TextAlign;
  valign: VerticalAlign;
}

export interface ImageElement extends BoxElement {
  type: 'image';
  /** Referencia a la imagen en el almacén de recursos (se comparte entre copias). */
  assetId: string;
}

export interface ShapeElement extends BoxElement {
  type: 'shape';
  shape: ShapeKind;
  /** Color del trazo (y del texto de dentro). */
  color: Color;
  /** Se dibuja el borde. Sin borde, la figura es una caja invisible (o solo su fondo). */
  border: boolean;
  /** Grosor del trazo en unidades del mundo. */
  strokeWidth: number;
  roughness: Roughness;
  /** Semilla para que el trazo "a mano" sea siempre el mismo. */
  seed: number;
  fill: NoteFill | null;
  fillStyle: FillStyle;
  label: Label | null;
}

/** Extremo de una flecha enganchado a otro elemento. */
export interface ArrowBinding {
  elementId: string;
  /** Adónde apunta dentro del elemento (0 a 1 en cada eje de su caja; 0.5 = el centro). */
  focus: Vec;
}

/**
 * Flecha entre dos puntos, recta o curva. Sus extremos pueden engancharse a otros
 * elementos y los siguen al moverlos. Nunca está girada: sus puntos ya lo están.
 */
export interface ArrowElement extends BaseElement {
  type: 'arrow';
  /** Inicio y final relativos a (x, y), aplanados como los trazos: [x0, y0, 0, x1, y1, 0]. */
  points: number[];
  /** Curva: cuánto se separa su centro de la recta (unidades del mundo; 0 = recta). */
  bend: number;
  start: ArrowBinding | null;
  end: ArrowBinding | null;
  color: Color;
  /** Grosor en unidades del mundo. */
  size: number;
  roughness: Roughness;
  seed: number;
  startHead: ArrowHead;
  endHead: ArrowHead;
}

export type SceneElement =
  StrokeElement | TextElement | NoteElement | ImageElement | ShapeElement | ArrowElement;
export type BoxSceneElement = TextElement | NoteElement | ImageElement | ShapeElement;
/** Lo que puede contener texto (figuras y trazos cerrados). */
export type ContainerElement = ShapeElement | StrokeElement;
/** Lo que se puede abrir en el editor de texto. */
export type EditableElement = TextElement | NoteElement | ContainerElement;

export const isBox = (el: SceneElement): el is BoxSceneElement =>
  el.type !== 'stroke' && el.type !== 'arrow';

/** Caja del elemento en sus propias coordenadas (antes de girar y mover), con el grosor incluido. */
export function localBounds(el: SceneElement): Bounds {
  if (isBox(el)) return { minX: 0, minY: 0, maxX: el.width, maxY: el.height };
  if (el.type === 'arrow') return arrowLocalBounds(el);
  const { points, size } = el;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const px = points[i];
    const py = points[i + 1];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const pad = size / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Caja alineada con los ejes que envuelve el elemento en el mundo (ya girado). */
export function elementBounds(el: SceneElement): Bounds {
  const { x, y, rotation } = el;
  if (rotation === 0) {
    const b = localBounds(el);
    return { minX: b.minX + x, minY: b.minY + y, maxX: b.maxX + x, maxY: b.maxY + y };
  }
  // Girado: se giran los puntos del trazo (más ajustado) o las esquinas de la caja.
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (lx: number, ly: number) => {
    const px = lx * cos - ly * sin;
    const py = lx * sin + ly * cos;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  let pad = 0;
  if (isBox(el)) {
    add(0, 0);
    add(el.width, 0);
    add(el.width, el.height);
    add(0, el.height);
  } else {
    for (let i = 0; i < el.points.length; i += 3) add(el.points[i], el.points[i + 1]);
    pad = el.size / 2;
  }
  return { minX: x + minX - pad, minY: y + minY - pad, maxX: x + maxX + pad, maxY: y + maxY + pad };
}

/** Pasa un punto del mundo a las coordenadas propias del elemento. */
export function toLocal(el: SceneElement, p: Vec): Vec {
  return rotateVec({ x: p.x - el.x, y: p.y - el.y }, -el.rotation);
}

/** Pasa un punto de las coordenadas del elemento al mundo. */
export function toWorld(el: SceneElement, p: Vec): Vec {
  const r = rotateVec(p, el.rotation);
  return { x: r.x + el.x, y: r.y + el.y };
}

export function createId(): string {
  return crypto.randomUUID();
}
