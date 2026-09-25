import type { Vec } from './math';
import type {
  ArrowHead,
  EditableElement,
  FillStyle,
  Roughness,
  SizedKind,
  TextAlign,
  VerticalAlign,
} from './elements';
import type { NoteVariant } from './notes';
import type { Color, NoteFill, ThemeMode } from './palette';

/** Lo que el motor cuenta y recibe: tipos públicos, sin lógica. */

export interface EngineTheme {
  mode: ThemeMode;
  background: string;
  dots: string;
  /** Color de la selección. */
  accent: string;
  /** Relleno de las asas de la selección. */
  handleFill: string;
}

export interface EngineCanvases {
  /** Capa de contenido: fondo, rejilla y elementos. */
  scene: HTMLCanvasElement;
  /** Capa superior, transparente: lo que se está dibujando ahora. Recibe el ratón. */
  overlay: HTMLCanvasElement;
}

export interface EngineOptions {
  /**
   * La mesa puede volverse transparente (en la app de escritorio, el diario flotante
   * deja ver el escritorio). Si no, el fondo es siempre opaco, que es algo más rápido.
   */
  transparent?: boolean;
  /**
   * Capa del escritorio (app de escritorio): solo lo que hay en la mesa, sin fondo, sobre
   * el escritorio de Windows y con la cámara fija (ver `lockCamera`).
   */
  deskLayer?: boolean;
}

/** Una vista: el punto del mundo en el centro de la pantalla y el zoom. */
export interface DeskView {
  center: Vec;
  zoom: number;
}

/** Un rectángulo en píxeles de la ventana. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Estilo común de lo seleccionado, para poder cambiarlo desde el panel. */
export interface SelectionStyle {
  /** Hay trazos o textos (se les aplica la paleta de tinta). */
  hasInk: boolean;
  /** Color de tinta si todos lo comparten. */
  color: Color | null;
  hasNotes: boolean;
  noteColor: NoteFill | null;
  noteVariant: NoteVariant | null;
  /** Color del texto de las notas ('auto' = tinta automática; null = distintos). */
  noteTextColor: Color | 'auto' | null;
  /** Hay textos o notas: se puede cambiar la fuente y la alineación. */
  hasText: boolean;
  font: string | null;
  align: TextAlign | null;
  /** Alineación vertical (notas y texto dentro de figuras). */
  valign: VerticalAlign | null;
  /** Hay figuras o trazos cerrados: admiten fondo. */
  hasFill: boolean;
  /** Fondo común ('none' = sin fondo; null = distintos). */
  fill: NoteFill | 'none' | null;
  fillStyle: FillStyle | null;
  /** Hay rectángulos o elipses: se puede elegir lo "a mano" del trazo. */
  hasShapes: boolean;
  /** Hay flechas: se pueden cambiar sus puntas. */
  hasArrows: boolean;
  startHead: ArrowHead | null;
  endHead: ArrowHead | null;
  /** Las figuras tienen borde (null = unas sí y otras no). */
  border: boolean | null;
  /** Lo que tiene color de tinta son solo rectángulos y elipses (su color es el borde). */
  inkIsShapes: boolean;
  roughness: Roughness | null;
  /** Hay texto dentro de figuras: su tamaño de letra (mundo) del primero. */
  hasLabels: boolean;
  labelSize: number | null;
  /** Qué rango de tamaño usar, o null si la selección mezcla cosas de tamaño distinto. */
  sizeKind: SizedKind | null;
  /** Grosor o tamaño de letra (unidades del mundo) del primer elemento. */
  size: number | null;
  /** Opacidad del primer elemento. */
  opacity: number;
}

/** Lo que la interfaz necesita saber del documento. */
export interface EngineState {
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;
  selectionCount: number;
  selectionStyle: SelectionStyle | null;
  /** Hay algún grupo dentro de lo seleccionado. */
  selectionGrouped: boolean;
  /** Todo lo seleccionado está bloqueado. */
  selectionLocked: boolean;
  /** Hay algo bloqueado en la página. */
  hasLocked: boolean;
  /** Hay un estilo copiado listo para pegar. */
  hasCopiedStyle: boolean;
  /** Algo de lo seleccionado lleva a otra página. */
  selectionHasLink: boolean;
  /** Página a la que lleva lo seleccionado (si todo lleva a la misma). */
  selectionLink: string | null;
}

export interface ContextMenuRequest {
  /** Posición del clic en la ventana. */
  x: number;
  y: number;
  /** Se hizo sobre un elemento (ya seleccionado) o sobre un hueco. */
  onElement: boolean;
}

/** Texto o nota abiertos en el editor. */
export interface EditingState {
  element: EditableElement;
  isNew: boolean;
}
