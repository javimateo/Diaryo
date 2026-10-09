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

/** What the engine reports and receives: public types, no logic. */

export interface EngineTheme {
  mode: ThemeMode;
  background: string;
  dots: string;
  /** Selection color. */
  accent: string;
  /** Fill of the selection handles. */
  handleFill: string;
}

export interface EngineCanvases {
  /** Content layer: background, grid and elements. */
  scene: HTMLCanvasElement;
  /** Top layer, transparent: what is being drawn now. It takes the mouse. */
  overlay: HTMLCanvasElement;
}

export interface EngineOptions {
  /**
   * The desk can become transparent (in the desktop app, the floating diary lets the
   * desktop show through). Otherwise the background is always opaque, which is a bit
   * faster.
   */
  transparent?: boolean;
  /**
   * Desktop layer (desktop app): only what is on the desk, without a background, over the
   * Windows desktop and with a fixed camera (see `lockCamera`).
   */
  deskLayer?: boolean;
  /**
   * Embedded in a page that scrolls (the website demo): the view is fixed (it is set with
   * `frameInto`), and the wheel and the space bar scroll the page as usual.
   */
  embedded?: boolean;
  /** Side of new notes in screen pixels (`NOTE_SIZE` by default). */
  noteSize?: number;
}

/** A view: the world point at the center of the screen and the zoom. */
export interface DeskView {
  center: Vec;
  zoom: number;
}

/** A rectangle in window pixels. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Common style of the selection, to change it from the panel. */
export interface SelectionStyle {
  /** There are strokes or texts (the ink palette applies to them). */
  hasInk: boolean;
  /** Ink color if they all share it. */
  color: Color | null;
  hasNotes: boolean;
  noteColor: NoteFill | null;
  noteVariant: NoteVariant | null;
  /** Note text color ('auto' = automatic ink; null = different). */
  noteTextColor: Color | 'auto' | null;
  /** There are texts or notes: the font and alignment can be changed. */
  hasText: boolean;
  font: string | null;
  /** Bold, italic and underline: on only if every text has it. */
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign | null;
  /** Vertical alignment (notes and text inside shapes). */
  valign: VerticalAlign | null;
  /** There are shapes or closed strokes: they accept a fill. */
  hasFill: boolean;
  /** Common fill ('none' = no fill; null = different). */
  fill: NoteFill | 'none' | null;
  fillStyle: FillStyle | null;
  /** There are rectangles or ellipses: the "hand-drawn" style of the stroke can be chosen. */
  hasShapes: boolean;
  /** There are arrows: their arrowheads can be changed. */
  hasArrows: boolean;
  startHead: ArrowHead | null;
  endHead: ArrowHead | null;
  /** The shapes have a border (null = some do and some don't). */
  border: boolean | null;
  /** What has an ink color is only rectangles and ellipses (their color is the border). */
  inkIsShapes: boolean;
  roughness: Roughness | null;
  /** There is text inside shapes: the font size (world) of the first one. */
  hasLabels: boolean;
  labelSize: number | null;
  /** Which size range to use, or null if the selection mixes things with different sizes. */
  sizeKind: SizedKind | null;
  /** Stroke width or font size (world units) of the first element. */
  size: number | null;
  /** Opacity of the first element. */
  opacity: number;
}

/** What the UI needs to know about the document. */
export interface EngineState {
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;
  selectionCount: number;
  selectionStyle: SelectionStyle | null;
  /** There is some group in the selection. */
  selectionGrouped: boolean;
  /** Everything selected is locked. */
  selectionLocked: boolean;
  /** Whether the selected notes are all private (null: no note is selected). */
  selectionPrivate: boolean | null;
  /** Something on the page is locked. */
  hasLocked: boolean;
  /** There is a copied style ready to paste. */
  hasCopiedStyle: boolean;
  /** Something in the selection leads to another page. */
  selectionHasLink: boolean;
  /** Page the selection leads to (if everything leads to the same one). */
  selectionLink: string | null;
}

export interface ContextMenuRequest {
  /** Click position in the window. */
  x: number;
  y: number;
  /** It was on an element (already selected) or on an empty spot. */
  onElement: boolean;
  /** It was on a hidden private note (not selected): its id. */
  hiddenNote?: string;
}

/** Text or note open in the editor. */
export interface EditingState {
  element: EditableElement;
  isNew: boolean;
}
