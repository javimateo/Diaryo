import {
  cameraAt,
  cameraCenter,
  clampZoom,
  fitCamera,
  interpolateCamera,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';
import { arrange, elementsToPng, flip, renderElements, type ArrangeMode } from './arrange';
import {
  bookBounds,
  drawBinding,
  isOnPage,
  tabAt,
  drawBook,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type BookSpread,
} from './book';
import { PageTurner, type TurnDirection, type TurnTarget } from './pageTurn';
import { badgeAt, drawLinkBadge, linkBadges, type LinkLabel } from './links';
import { detachMoved } from './arrows';
import { AssetStore, isImageFile, loadImageFile } from './assets';
import { parseElements, serializeElements } from './clipboard';
import { brushCursor, eraserCursor } from './cursors';
import { isEditableTarget } from './dom';
import { defaultLabel, isClosedStroke, isContainer, textOf, withText } from './containers';
import { createText, fitEditable, isEditable } from './editing';
import {
  createId,
  DEFAULT_STYLES,
  type ArrowBinding,
  type ArrowHead,
  elementBounds,
  type EditableElement,
  type FillStyle,
  type ImageElement,
  type Roughness,
  type SceneElement,
  type SizedKind,
  type TextAlign,
  type ToolStyles,
  type VerticalAlign,
} from './elements';
import { unionBounds, type Bounds } from './geometry';
import { drawDotGrid } from './grid';
import { CreateHandler } from './handlers/create';
import { DrawHandler } from './handlers/draw';
import { ERASER_RADIUS, EraseHandler } from './handlers/erase';
import { SelectHandler } from './handlers/select';
import { ShapeHandler } from './handlers/shape';
import { ArrowHandler } from './handlers/arrow';
import type { PointerInput, ToolContext, ToolHandler } from './handlers/types';
import { History } from './history';
import { clamp, easeOutCubic, smoothingFactor, type Size, type Vec } from './math';
import { BUILTIN_FONTS, fonts } from './fonts';
import type { NoteVariant } from './notes';
import { resolveColor, type Color, type NoteFill, type ThemeMode } from './palette';
import { drawElement, type RenderContext } from './render';
import { Scene, type Changes } from './scene';
import { elementHitsSegment } from './hit';
import { containerAt, hitTestElement } from './selection';
import { applyStyle, patchMergeKey, type StylePatch } from './restyle';
import { clearTextCache } from './text';
import { taskAt, withTaskToggled } from './tasks';
import { DESK_SCALE, deskColor, deskTexture } from './desk';
import { TOOL_CURSORS, type ToolId } from './tools';
import { translateElement } from './transform';

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

type CameraListener = (camera: Camera) => void;
type StateListener = (state: EngineState) => void;
type EditingListener = (state: EditingState | null) => void;

/** Herramientas que muestran y conservan la selección. */
const SELECTION_TOOLS: ToolId[] = ['select', 'lasso'];

type Gesture =
  | {
      type: 'pan';
      pointerId: number;
      last: Vec;
      /** Posiciones recientes para calcular la velocidad al soltar (inercia). */
      samples: { t: number; x: number; y: number }[];
    }
  | { type: 'tool'; pointerId: number; handler: ToolHandler }
  | { type: 'turn'; pointerId: number };

interface ZoomAnimation {
  target: number;
  anchor: Vec;
}

interface CameraTween {
  from: Camera;
  to: Camera;
  start: number;
  duration: number;
}

/** Una rueda de ratón da saltos grandes (±100); un trackpad, muchos pequeños. */
const WHEEL_SMOOTH_THRESHOLD = 40;
const WHEEL_ZOOM_SPEED = 0.0025;
const PINCH_ZOOM_SPEED = 0.01;
const ZOOM_STEP = 1.25;
/** Constantes de tiempo (ms) de los suavizados. */
const ZOOM_TAU = 55;
const PAN_TAU = 45;
const INERTIA_TAU = 160;
/** px/ms */
const INERTIA_MIN_SPEED = 0.02;
const INERTIA_START_SPEED = 0.1;
const FIT_PADDING = 64;
/** Desplazamiento (px de pantalla) de lo duplicado respecto al original. */
const DUPLICATE_OFFSET = 16;
/** Cuánto dura el brillo que señala algo (p. ej. lo encontrado al buscar), en ms. */
const HIGHLIGHT_DURATION = 1800;

/**
 * Motor del lienzo: dibuja en dos <canvas> superpuestos y gestiona cámara, entrada
 * y herramientas. Es TypeScript puro (sin React) para que el bucle de dibujo sea lo
 * más rápido posible; solo redibuja la capa que cambia.
 */
export class Engine {
  readonly scene = new Scene();
  private readonly history = new History(this.scene, () => this.onHistoryChange());
  /** Imágenes de la página (el autoguardado escucha las nuevas). */
  readonly assets = new AssetStore(() => this.invalidateScene());

  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly sceneCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;

  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private viewport: Size = { width: 0, height: 0 };
  private origin: Vec = { x: 0, y: 0 };
  private dpr = 1;
  private sized = false;
  private theme: EngineTheme = {
    mode: 'light',
    background: '#faf9f6',
    dots: '#cdc8bf',
    accent: '#5b5bd6',
    handleFill: '#ffffff',
  };
  private styles: ToolStyles = DEFAULT_STYLES;
  private tool: ToolId = 'select';
  private readonly handlers: Partial<Record<ToolId, ToolHandler>>;
  private spaceHeld = false;
  private selection = new Set<string>();
  /** Cursor que pide la herramienta según lo que hay bajo el ratón (asas, elementos…). */
  private hoverCursor: string | null = null;
  /** Última posición del ratón sobre el lienzo (para pegar donde está). */
  private lastPointer: Vec | null = null;
  private editing: EditingState | null = null;
  private readonly editingListeners = new Set<EditingListener>();
  /** La interfaz decide qué herramienta está activa; el motor solo puede pedírselo. */
  private toolRequest: (tool: ToolId) => void = () => {};
  private contextMenuListener: (request: ContextMenuRequest) => void = () => {};
  private copiedStyle: { patch: StylePatch; type: SceneElement['type'] } | null = null;

  private gesture: Gesture | null = null;
  private zoomAnim: ZoomAnimation | null = null;
  private pendingPan: Vec = { x: 0, y: 0 };
  private inertia: Vec | null = null;
  private tween: CameraTween | null = null;
  /** Doble página del diario sobre la que se escribe (null: lienzo sin libro). */
  private book: BookSpread | null = null;
  private pageTurnListener: (dir: TurnDirection) => void = () => {};
  private bookTabListener: (pageId: string) => void = () => {};
  private linkListener: (pageId: string) => void = () => {};
  /** Nombre de cada página (para las etiquetas de los enlaces). */
  private linkLabels = new Map<string, string>();
  /** El libro ya se encuadró una vez: al pasar página la cámara se queda donde está. */
  private bookFramed = false;
  /** Lo que se señala un momento (p. ej. lo encontrado al buscar). */
  private highlight: { id: string; start: number } | null = null;
  private readonly deskPatterns = new WeakMap<HTMLCanvasElement, CanvasPattern>();
  /** Diario flotante: en vez de la mesa se ve el escritorio, con un velo suave. */
  private transparentDesk = false;
  private readonly deskLayer: boolean;
  /** Cámara fija: siempre encuadra esto (también al cambiar el tamaño de la ventana). */
  private lockedCamera: (() => Camera) | null = null;
  private deskIds: ReadonlySet<string> = new Set();
  /** Al cambiar el tamaño de la ventana, volver a encuadrar el libro entero. */
  private fitOnResize: (() => Camera) | null = null;
  private readonly pageTurner = new PageTurner({
    renderTexture: (target, scale) => this.renderSpread(target, scale),
    invalidate: () => this.invalidateOverlay(),
    onTurn: (dir) => this.pageTurnListener(dir),
  });

  private sceneDirty = true;
  private overlayDirty = true;
  private frame = 0;
  private lastTick = 0;
  private readonly cameraListeners = new Set<CameraListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly cleanups: (() => void)[] = [];
  private unwatchDpr: () => void = () => {};

  constructor({ scene, overlay }: EngineCanvases, options: EngineOptions = {}) {
    this.deskLayer = options.deskLayer ?? false;
    const transparent = (options.transparent ?? false) || this.deskLayer;
    const sceneCtx = scene.getContext('2d', { alpha: transparent });
    const overlayCtx = overlay.getContext('2d');
    if (!sceneCtx || !overlayCtx) throw new Error('Este navegador no soporta Canvas 2D');
    this.sceneCanvas = scene;
    this.overlayCanvas = overlay;
    this.sceneCtx = sceneCtx;
    this.overlayCtx = overlayCtx;

    const context = this.createToolContext();
    this.handlers = {
      select: new SelectHandler(context, 'rect'),
      lasso: new SelectHandler(context, 'lasso'),
      pen: new DrawHandler(context, 'pen'),
      marker: new DrawHandler(context, 'marker'),
      eraser: new EraseHandler(context),
      text: new CreateHandler(context, 'text'),
      note: new CreateHandler(context, 'note'),
      rect: new ShapeHandler(context, 'rect'),
      ellipse: new ShapeHandler(context, 'ellipse'),
      arrow: new ArrowHandler(context),
    };

    this.listen(overlay, 'pointerdown', this.onPointerDown);
    this.listen(overlay, 'pointermove', this.onPointerMove);
    this.listen(overlay, 'pointerup', this.onPointerUp);
    this.listen(overlay, 'pointercancel', this.onPointerUp);
    // Evita el autodesplazamiento de Windows con el botón central.
    this.listen(overlay, 'mousedown', (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    });
    this.listen(overlay, 'contextmenu', this.handleContextMenu);
    this.listen(overlay, 'pointerleave', () => {
      this.lastPointer = null;
    });
    this.listen(overlay, 'dblclick', this.onDoubleClick);
    this.listen(overlay, 'dragover', (e: DragEvent) => e.preventDefault());
    this.listen(overlay, 'drop', this.onDrop);
    this.listen(window, 'wheel', this.onWheel, { passive: false });
    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);
    this.listen(window, 'blur', this.onBlur);

    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(overlay);
    this.cleanups.push(() => resizeObserver.disconnect());
    this.watchDpr();

    this.resize();
    this.updateCursor();

    // Las medidas de texto dependen de la fuente: rehacerlas cuando termine de cargar.
    // Las medidas de texto dependen de la fuente: rehacerlas cuando termine de cargar
    // cada una. Las incluidas se precargan para que al elegirlas ya estén listas.
    this.cleanups.push(
      fonts.subscribe(() => {
        clearTextCache();
        this.invalidateScene();
        this.invalidateOverlay();
      }),
    );
    BUILTIN_FONTS.forEach((font) => void fonts.load(font.id));
  }

  // ─── API pública ──────────────────────────────────────────────

  getCamera(): Camera {
    return this.camera;
  }

  subscribe(listener: CameraListener): () => void {
    this.cameraListeners.add(listener);
    listener(this.camera);
    return () => this.cameraListeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.engineState());
    return () => this.stateListeners.delete(listener);
  }

  setTool(tool: ToolId) {
    if (tool === this.tool) return;
    this.finishEditing(false);
    this.endToolGesture();
    this.tool = tool;
    if (!SELECTION_TOOLS.includes(tool)) this.setSelection([]);
    this.hoverCursor = null;
    this.invalidateScene();
    this.invalidateOverlay();
    this.updateCursor();
  }

  setStyles(styles: ToolStyles) {
    this.styles = styles;
    this.invalidateOverlay();
    this.updateCursor();
  }

  setTheme(theme: EngineTheme) {
    this.theme = theme;
    this.pageTurner.clearTextures();
    this.invalidateScene();
    this.invalidateOverlay();
    this.updateCursor();
  }

  undo() {
    if (this.gesture?.type !== 'tool') this.history.undo();
  }

  redo() {
    if (this.gesture?.type !== 'tool') this.history.redo();
  }

  zoomIn() {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut() {
    this.zoomBy(1 / ZOOM_STEP);
  }

  /** Vuelve al 100 % sin moverse del sitio. */
  resetZoom() {
    this.animateTo(cameraAt(cameraCenter(this.camera, this.viewport), 1, this.viewport));
  }

  /** Encuadra todo el contenido (y el libro). Si no hay nada, vuelve al origen. */
  zoomToFit() {
    this.animateTo(this.fitCamera());
  }

  /** Muestra la doble página entera (sin animación, p. ej. antes de pasar página). */
  showWholeBook() {
    if (!this.book) return;
    this.stopMotion();
    this.setCamera(fitCamera(bookBounds(this.book), this.viewport, FIT_PADDING));
  }

  /**
   * Mesa transparente (diario flotante sobre el escritorio) o la de siempre. Se dibuja
   * ya, sin esperar al siguiente frame: la ventana puede estar escondida y enseñarse
   * justo después. Se ve el libro entero o, en el diario flotante, la vista de la mesa
   * del escritorio (`view`); se vuelve a poner cuando cambie el tamaño de la ventana.
   */
  setTransparentDesk(on: boolean, view: DeskView | null = null) {
    this.transparentDesk = on;
    const target = () =>
      on && view
        ? cameraAt(view.center, view.zoom, this.viewport)
        : this.book
          ? fitCamera(bookBounds(this.book), this.viewport, FIT_PADDING)
          : this.camera;
    this.fitOnResize = target;
    this.stopMotion();
    this.setCamera(target());
    this.renderScene();
    this.sceneDirty = false;
  }

  /** Va (con animación) a una vista guardada. */
  animateToView(view: DeskView) {
    this.animateTo(cameraAt(view.center, view.zoom, this.viewport));
  }

  /** Lo que se está viendo: el punto del centro de la pantalla y el zoom. */
  view(): DeskView {
    return { center: cameraCenter(this.camera, this.viewport), zoom: this.camera.zoom };
  }

  /**
   * Deja la cámara fija encuadrando estos límites, como el diario flotante encuadra el
   * libro al abrirse: así la capa del escritorio pone la mesa en el mismo sitio.
   */
  lockCamera(bounds: Bounds) {
    this.lock(() => fitCamera(bounds, this.viewport, FIT_PADDING));
  }

  /** Deja la cámara fija en esta vista (la última del diario flotante). */
  lockView(view: DeskView) {
    this.lock(() => cameraAt(view.center, view.zoom, this.viewport));
  }

  private lock(camera: () => Camera) {
    this.lockedCamera = camera;
    this.stopMotion();
    this.setCamera(camera());
  }

  /**
   * Dónde hay algo en la pantalla (en píxeles de la ventana, con un margen; más amplio en
   * lo seleccionado, por sus asas). En la capa del escritorio, fuera de ahí los clics
   * pasan al escritorio.
   */
  hitAreas(margin = 6, selectedMargin = 40): ScreenRect[] {
    const areas: ScreenRect[] = [];
    const editing = this.editing?.element;
    const elements = this.scene.all().map((el) => (el.id === editing?.id ? editing : el));
    if (editing && !this.scene.get(editing.id)) elements.push(editing);
    for (const el of elements) {
      const pad = this.selection.has(el.id) || el.id === editing?.id ? selectedMargin : margin;
      const b = elementBounds(el);
      const min = worldToScreen(this.camera, { x: b.minX, y: b.minY });
      const max = worldToScreen(this.camera, { x: b.maxX, y: b.maxY });
      areas.push({
        x: min.x - pad,
        y: min.y - pad,
        width: max.x - min.x + pad * 2,
        height: max.y - min.y + pad * 2,
      });
    }
    return areas;
  }

  setBook(book: BookSpread | null) {
    this.book = book;
    this.invalidateScene();
  }

  // ─── Pasar página ─────────────────────────────────────────────

  /** Páginas anterior y siguiente, para poder pasar a ellas arrastrando la esquina. */
  setTurnTargets(prev: TurnTarget | null, next: TurnTarget | null) {
    this.pageTurner.setTargets(prev, next);
  }

  // ─── Enlaces a otras páginas ─────────────────────────────────

  /** Enlaza lo seleccionado con una página (o quita el enlace con null). */
  setSelectionLink(pageId: string | null): boolean {
    const elements = this.selectedElements();
    if (elements.length === 0) return false;
    this.history.commit(new Map(elements.map((el) => [el.id, { ...el, link: pageId }])));
    return true;
  }

  /** Nombres de las páginas, para las etiquetas de los enlaces. */
  setLinkLabels(labels: Map<string, string>) {
    this.linkLabels = labels;
    this.invalidateScene();
  }

  /** Avisa al pulsar la etiqueta de un enlace. */
  onLinkOpen(listener: (pageId: string) => void) {
    this.linkListener = listener;
  }

  private linkLabel = (pageId: string): LinkLabel => {
    const text = this.linkLabels.get(pageId);
    return text === undefined
      ? { text: 'Página borrada', missing: true }
      : { text, missing: false };
  };

  /** Etiquetas de enlace de lo que se ve. */
  private visibleBadges() {
    const elements = this.scene.search(this.visibleBounds()).filter((el) => el.link);
    return linkBadges(elements, this.linkLabel, this.camera.zoom);
  }

  /** Página del enlace cuya etiqueta está bajo el punto, o null. */
  private linkUnder(world: Vec): string | null {
    // En lo seleccionado mandan sus asas (su enlace se abre desde el panel).
    const badges = this.visibleBadges().filter((b) => !b.ids.some((id) => this.selection.has(id)));
    return badgeAt(badges, world)?.link ?? null;
  }

  /** Tarea cuya casilla está bajo el punto (lo de más arriba primero), o null. */
  private taskUnder(world: Vec): { el: SceneElement; paragraph: number } | null {
    if (this.tool !== 'select' && this.tool !== 'lasso') return null;
    const slop = 4 / this.camera.zoom;
    const near = { minX: world.x - 1, minY: world.y - 1, maxX: world.x + 1, maxY: world.y + 1 };
    const candidates = this.scene.search(near).sort((a, b) => b.z - a.z);
    for (const el of candidates) {
      const paragraph = taskAt(el, world, slop);
      if (paragraph !== null) return { el, paragraph };
    }
    return null;
  }

  /** Avisa al pulsar la pestaña de una página marcada. */
  onBookTab(listener: (pageId: string) => void) {
    this.bookTabListener = listener;
  }

  /** Avisa cuando se suelta una hoja pasada la mitad: hay que abrir esa página. */
  onPageTurn(listener: (dir: TurnDirection) => void) {
    this.pageTurnListener = listener;
  }

  /** Pasa la hoja sola hasta mostrar `target` (queda así hasta endPageTurn). */
  animatePageTurn(dir: TurnDirection, target: TurnTarget, duration?: number): Promise<void> {
    if (!this.book) return Promise.resolve();
    this.cancelGesture();
    this.pageTurner.setScale(this.dpr * this.camera.zoom);
    return this.pageTurner.turn(dir, target, duration);
  }

  /** La nueva página ya está cargada: se quita la hoja que se estaba pasando. */
  endPageTurn() {
    this.pageTurner.end();
  }

  /** Miniatura de otra página (su doble página en pequeño), a ese ancho. */
  spreadThumbnail(target: TurnTarget, width: number): string {
    return this.renderSpread(target, width / (PAGE_WIDTH * 2)).toDataURL('image/webp', 0.85);
  }

  /** Dibuja una doble página (papel y contenido, sin tapas) para la hoja que se pasa. */
  private renderSpread(target: TurnTarget, scale: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PAGE_WIDTH * 2 * scale);
    canvas.height = Math.round(PAGE_HEIGHT * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, PAGE_WIDTH * scale, (PAGE_HEIGHT / 2) * scale);
    drawBook(ctx, target.book, this.theme.mode, scale, true);
    const rc: RenderContext = {
      mode: this.theme.mode,
      pixelScale: scale,
      assets: this.assets,
      editingId: null,
    };
    for (const el of [...target.elements].sort((a, b) => a.z - b.z)) drawElement(ctx, el, rc);
    return canvas;
  }

  private fitCamera(): Camera {
    const content = this.scene.contentBounds();
    const book = this.book ? bookBounds(this.book) : null;
    const bounds = content && book ? unionBounds(content, book) : (content ?? book);
    return bounds
      ? fitCamera(bounds, this.viewport, FIT_PADDING)
      : cameraAt({ x: 0, y: 0 }, 1, this.viewport);
  }

  animateTo(to: Camera, duration = 320) {
    this.stopMotion();
    this.tween = { from: this.camera, to, start: performance.now(), duration };
    this.requestFrame();
  }

  /**
   * Señala un elemento (p. ej. lo encontrado al buscar): si no se ve entero, la cámara
   * va hasta él, y se ilumina un momento.
   */
  focusElement(id: string): boolean {
    const el = this.scene.get(id);
    if (!el) return false;
    const bounds = elementBounds(el);
    const view = this.visibleBounds();
    const margin = 24 / this.camera.zoom;
    const visible =
      bounds.minX >= view.minX + margin &&
      bounds.maxX <= view.maxX - margin &&
      bounds.minY >= view.minY + margin &&
      bounds.maxY <= view.maxY - margin;
    const flight = 420;
    // Con el mismo zoom si cabe; si no, lo justo para verlo entero.
    if (!visible)
      this.animateTo(fitCamera(bounds, this.viewport, FIT_PADDING, this.camera.zoom), flight);
    // El brillo empieza al llegar.
    this.highlight = { id, start: performance.now() + (visible ? 0 : flight * 0.6) };
    this.invalidateOverlay();
    return true;
  }

  // ─── Selección ────────────────────────────────────────────────

  selectAll() {
    this.setSelection(
      this.scene
        .all()
        .filter((el) => !el.locked)
        .map((el) => el.id),
    );
  }

  clearSelection() {
    this.setSelection([]);
  }

  deleteSelection(): boolean {
    const ids = this.selectedElements()
      .filter((el) => !el.locked)
      .map((el) => el.id);
    if (ids.length === 0 || this.gesture?.type === 'tool') return false;
    const changes: Changes = new Map(ids.map((id) => [id, null]));
    this.setSelection([]);
    this.history.commit(changes);
    return true;
  }

  duplicateSelection(): boolean {
    const elements = this.selectedElements();
    if (elements.length === 0 || this.gesture?.type === 'tool') return false;
    const offset = DUPLICATE_OFFSET / this.camera.zoom;
    this.insertCopies(elements, offset, offset);
    return true;
  }

  /** Mueve la selección unos píxeles de pantalla (flechas del teclado). */
  nudgeSelection(dx: number, dy: number): boolean {
    const elements = this.selectedElements().filter((el) => !el.locked);
    if (elements.length === 0 || this.gesture?.type === 'tool') return false;
    const { zoom } = this.camera;
    const moving = new Set(elements.map((el) => el.id));
    this.history.commit(
      new Map(
        elements.map((el) => [
          el.id,
          detachMoved(translateElement(el, dx / zoom, dy / zoom), moving),
        ]),
      ),
    );
    return true;
  }

  /** Texto para el portapapeles con lo seleccionado, o null si no hay selección. */
  copySelection(): string | null {
    const elements = this.selectedElements();
    if (elements.length === 0) return null;
    const assets: Record<string, string> = {};
    for (const el of elements) {
      const src = el.type === 'image' ? this.assets.src(el.assetId) : undefined;
      if (el.type === 'image' && src) assets[el.assetId] = src;
    }
    return serializeElements({ elements, assets });
  }

  /** Pega lo copiado desde diaryo bajo el ratón (o en el centro). Devuelve false si no lo reconoce. */
  paste(text: string): boolean {
    const content = parseElements(text);
    if (!content || this.gesture?.type === 'tool') return false;
    for (const [id, src] of Object.entries(content.assets)) this.assets.add(src, id);
    this.insertCentered(content.elements, this.pasteTarget());
    return true;
  }

  /** Crea un texto (p. ej. al pegar texto normal) bajo el ratón o en el centro. */
  insertText(text: string): boolean {
    const clean = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    if (clean.trim() === '' || this.gesture?.type === 'tool') return false;
    const element = fitEditable({
      ...createText({ x: 0, y: 0 }, this.camera.zoom, this.styles, 0),
      text: clean,
    });
    this.insertCentered([element], this.pasteTarget());
    return true;
  }

  /**
   * Añade imágenes (pegadas o arrastradas). Se ven a su tamaño real en pantalla,
   * reducidas si no caben, y en fila si son varias.
   */
  async insertImageFiles(files: File[], at?: Vec): Promise<boolean> {
    const images = files.filter(isImageFile);
    if (images.length === 0) return false;
    const loaded = await Promise.all(images.map((file) => loadImageFile(file).catch(() => null)));
    const { zoom } = this.camera;
    const maxWidth = (this.viewport.width * 0.6) / zoom;
    const maxHeight = (this.viewport.height * 0.6) / zoom;
    const gap = 16 / zoom;
    const elements: ImageElement[] = [];
    let x = 0;
    for (const image of loaded) {
      if (!image) continue;
      const scale = Math.min(1 / zoom, maxWidth / image.width, maxHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      elements.push({
        id: createId(),
        type: 'image',
        z: 0,
        x,
        y: -height / 2,
        rotation: 0,
        opacity: 1,
        groupId: null,
        locked: false,
        assetId: this.assets.add(image.src),
        width,
        height,
      });
      x += width + gap;
    }
    if (elements.length === 0) return false;
    this.insertCentered(elements, at ? screenToWorld(this.camera, at) : this.pasteTarget());
    this.toolRequest('select');
    return true;
  }

  /**
   * Cambia color o tamaño de lo seleccionado. Los cambios seguidos del mismo tipo
   * (arrastrar el deslizador) se deshacen de una vez.
   */
  restyleSelection(patch: StylePatch) {
    const changes: Changes = new Map();
    for (const el of this.selectedElements()) {
      changes.set(el.id, applyStyle(el, patch, this.camera.zoom));
    }
    this.history.commit(changes, patchMergeKey(patch));
  }

  // ─── Edición de texto ─────────────────────────────────────────

  subscribeEditing(listener: EditingListener): () => void {
    this.editingListeners.add(listener);
    listener(this.editing);
    return () => this.editingListeners.delete(listener);
  }

  /** La interfaz se entera de que el motor quiere cambiar de herramienta. */
  onToolRequest(listener: (tool: ToolId) => void) {
    this.toolRequest = listener;
  }

  /** Enter sobre un texto o nota seleccionados: editarlo. */
  editSelection(): boolean {
    const [el] = this.selectedElements();
    if (this.selection.size !== 1 || !el || !isEditable(el)) return false;
    this.startEditing(el, false);
    return true;
  }

  updateEditingText(text: string) {
    if (!this.editing) return;
    this.setEditing({
      ...this.editing,
      element: fitEditable(withText(this.editing.element, text)),
    });
  }

  /** Cambiar color o tamaño mientras se escribe. */
  updateEditingStyle(patch: StylePatch) {
    const editing = this.editing;
    if (!editing) return;
    const element = applyStyle(editing.element, patch, this.camera.zoom);
    this.setEditing({ ...editing, element: fitEditable(element) });
  }

  /**
   * Cierra el editor guardando el resultado. Un texto vacío se descarta; una nota
   * vacía se conserva (sirve como bloque de color).
   */
  finishEditing(selectResult = true) {
    const editing = this.editing;
    if (!editing) return;
    this.setEditing(null);
    const { isNew } = editing;
    let { element } = editing;
    const original = this.scene.get(element.id);
    const empty = textOf(element).trim() === '';

    if (element.type === 'text' && empty) {
      if (original) this.history.commit(new Map([[element.id, null]]));
      return;
    }
    // Una figura sin texto deja de tener etiqueta.
    if (isContainer(element) && empty) element = { ...element, label: null };
    // Cualquier propiedad cuenta (texto, fuente, alineación, opacidad…).
    const unchanged = !!original && JSON.stringify(original) === JSON.stringify(element);
    if (isNew || !unchanged) this.history.commit(new Map([[element.id, element]]));
    if (selectResult) {
      this.toolRequest('select');
      this.setSelection([element.id]);
    }
  }

  private startEditing(element: EditableElement, isNew: boolean) {
    this.finishEditing(false);
    this.setSelection([]);
    // Una figura sin texto recibe uno vacío con el estilo por defecto.
    const ready =
      isContainer(element) && !element.label
        ? { ...element, label: defaultLabel(this.styles, this.camera.zoom) }
        : element;
    this.setEditing({ element: ready, isNew });
  }

  private setEditing(editing: EditingState | null) {
    this.editing = editing;
    this.invalidateScene();
    this.invalidateOverlay();
    this.editingListeners.forEach((listener) => listener(editing));
  }

  private onDoubleClick = (e: MouseEvent) => {
    if (!SELECTION_TOOLS.includes(this.tool) || this.editing) return;
    const world = screenToWorld(this.camera, this.localPoint(e));
    const hit = hitTestElement(this.scene, world, 4 / this.camera.zoom);
    // Dentro de una figura (aunque no tenga fondo) se escribe en ella.
    const target = hit && isEditable(hit) ? hit : hit ? null : containerAt(this.scene, world);
    if (target) this.startEditing(target, false);
    else if (!hit) {
      this.startEditing(createText(world, this.camera.zoom, this.styles, this.scene.nextZ()), true);
    }
  };

  private onDrop = (e: DragEvent) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.some(isImageFile)) return;
    e.preventDefault();
    void this.insertImageFiles(files, this.localPoint(e));
  };

  private pasteTarget(): Vec {
    return screenToWorld(
      this.camera,
      this.lastPointer ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 },
    );
  }

  /** Inserta copias de los elementos con su centro común en `center`. */
  private insertCentered(elements: SceneElement[], center: Vec) {
    const bounds = elements.map(elementBounds).reduce(unionBounds);
    this.insertCopies(
      elements,
      center.x - (bounds.minX + bounds.maxX) / 2,
      center.y - (bounds.minY + bounds.maxY) / 2,
    );
  }

  // ─── Organizar (menú contextual) ──────────────────────────────

  /** El motor avisa de un clic derecho; la interfaz muestra el menú. */
  onContextMenu(listener: (request: ContextMenuRequest) => void) {
    this.contextMenuListener = listener;
  }

  /** Agrupa lo seleccionado: a partir de ahora se selecciona y se mueve junto. */
  groupSelection(): boolean {
    const elements = this.selectedElements().filter((el) => !el.locked);
    if (elements.length < 2) return false;
    const groupId = createId();
    this.history.commit(new Map(elements.map((el) => [el.id, { ...el, groupId }])));
    return true;
  }

  ungroupSelection(): boolean {
    const elements = this.selectedElements().filter((el) => el.groupId);
    if (elements.length === 0) return false;
    this.history.commit(new Map(elements.map((el) => [el.id, { ...el, groupId: null }])));
    return true;
  }

  /** Bloquea (o desbloquea, si ya lo estaba todo) lo seleccionado. */
  toggleLockSelection(): boolean {
    const elements = this.selectedElements();
    if (elements.length === 0) return false;
    const locked = !elements.every((el) => el.locked);
    this.history.commit(new Map(elements.map((el) => [el.id, { ...el, locked }])));
    if (locked) this.setSelection([]);
    return true;
  }

  unlockAll(): boolean {
    const locked = this.scene.all().filter((el) => el.locked);
    if (locked.length === 0) return false;
    this.history.commit(new Map(locked.map((el) => [el.id, { ...el, locked: false }])));
    this.setSelection(locked.map((el) => el.id));
    return true;
  }

  arrangeSelection(mode: ArrangeMode): boolean {
    if (this.selection.size === 0) return false;
    this.history.commit(arrange(this.scene.all(), this.selection, mode));
    return true;
  }

  flipSelection(axis: 'horizontal' | 'vertical'): boolean {
    const elements = this.selectedElements().filter((el) => !el.locked);
    if (elements.length === 0) return false;
    this.history.commit(flip(elements, axis));
    return true;
  }

  /** Recuerda el estilo del primer elemento seleccionado para pegarlo en otros. */
  copyStyle(): boolean {
    const [el] = this.selectedElements();
    if (!el) return false;
    const { zoom } = this.camera;
    const patch: StylePatch = { opacity: el.opacity };
    if (el.type === 'stroke') Object.assign(patch, { color: el.color, size: el.size * zoom });
    if (el.type === 'text') {
      Object.assign(patch, {
        color: el.color,
        size: el.fontSize * zoom,
        font: el.font,
        align: el.align,
      });
    }
    if (el.type === 'note') {
      Object.assign(patch, {
        noteColor: el.color,
        noteVariant: el.variant,
        noteTextColor: el.textColor,
        size: el.fontSize * zoom,
        font: el.font,
        align: el.align,
        valign: el.valign,
      });
    }
    this.copiedStyle = { patch, type: el.type };
    this.emitState();
    return true;
  }

  pasteStyle(): boolean {
    const copied = this.copiedStyle;
    if (!copied || this.selection.size === 0) return false;
    const changes: Changes = new Map();
    for (const el of this.selectedElements()) {
      // Un grosor de trazo no tiene sentido como tamaño de letra (ni al revés).
      const { size, ...rest } = copied.patch;
      const patch = el.type === copied.type ? copied.patch : rest;
      void size;
      changes.set(el.id, applyStyle(el, patch, this.camera.zoom));
    }
    this.history.commit(changes);
    return true;
  }

  /** Copia lo seleccionado como imagen PNG (para pegarlo en otras aplicaciones). */
  async copySelectionAsPng(): Promise<boolean> {
    const elements = this.selectedElements();
    if (elements.length === 0 || typeof ClipboardItem === 'undefined') return false;
    const blob = await elementsToPng(elements, {
      mode: this.theme.mode,
      assets: this.assets,
      background: this.theme.background,
    });
    if (!blob) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (this.gesture) return;
    this.finishEditing(false);
    const world = screenToWorld(this.camera, this.localPoint(e));
    // Con el menú también se alcanzan los bloqueados (para poder desbloquearlos).
    const hit = hitTestElement(this.scene, world, 6 / this.camera.zoom, true);
    if (hit && !this.selection.has(hit.id)) this.setSelection([hit.id]);
    if (!hit) this.setSelection([]);
    if (hit && !SELECTION_TOOLS.includes(this.tool)) this.toolRequest('select');
    this.lastPointer = this.localPoint(e);
    this.contextMenuListener({ x: e.clientX, y: e.clientY, onElement: !!hit });
  };

  // ─── Documento (cargar, reemplazar, exportar) ────────────────

  allElements(): SceneElement[] {
    return this.scene.all();
  }

  /** Lo que es de la página abierta (en el diario, sin lo que hay en la mesa). */
  pageElements(): SceneElement[] {
    const all = this.scene.all();
    const desk = this.deskIds;
    return this.book ? all.filter((el) => !desk.has(el.id) && isOnPage(elementBounds(el))) : all;
  }

  /**
   * Lo que es de la mesa (lo lleva el diario). Aunque esté donde se abre el libro, no es
   * de la página.
   */
  setDeskIds(ids: ReadonlySet<string>) {
    this.deskIds = ids;
  }

  /**
   * Pone en la mesa lo guardado en ella (se queda al pasar página) y quita lo que ya no
   * está (`removed`). Sin historial.
   */
  loadDesk(elements: SceneElement[], removed: string[] = []) {
    const notify = this.scene.onChange;
    this.scene.onChange = () => {};
    const changes: Changes = new Map(removed.map((id) => [id, null]));
    for (const el of elements) changes.set(el.id, el);
    this.scene.apply(changes);
    if (removed.some((id) => this.selection.has(id))) {
      this.setSelection([...this.selection].filter((id) => !removed.includes(id)));
    }
    this.scene.onChange = notify;
    this.invalidateScene();
    this.emitState();
  }

  /**
   * Carga una página guardada: sin historial de deshacer y sin avisar de cambios.
   * Sin cámara guardada, encuadra el contenido (o el origen si está vacía).
   */
  loadPage(elements: SceneElement[], camera?: Camera | null) {
    this.cancelGesture();
    this.finishEditing(false);
    this.setSelection([]);
    // En el diario, lo que hay en la mesa se queda: solo cambia lo de dentro del libro.
    const leaving = this.book ? this.pageElements() : this.scene.all();
    const changes: Changes = new Map(leaving.map((el) => [el.id, null]));
    for (const el of elements) changes.set(el.id, el);
    const notify = this.scene.onChange;
    this.scene.onChange = () => {};
    this.scene.apply(changes);
    this.scene.onChange = notify;
    this.history.clear();
    this.stopMotion();
    // En el diario, el libro no se mueve al pasar página (la primera vez se encuadra). Con
    // la cámara fija, tampoco.
    const keep = this.lockedCamera || (this.book && this.bookFramed);
    if (this.book && this.sized) this.bookFramed = true;
    this.setCamera(
      camera ??
        (keep
          ? this.camera
          : this.book
            ? fitCamera(bookBounds(this.book), this.viewport, FIT_PADDING)
            : this.fitCamera()),
    );
    this.invalidateScene();
  }

  /** Miniatura de toda la página (siempre en tema claro), o null si está vacía. */
  thumbnail(width: number, height: number): string | null {
    const elements = this.pageElements();
    if (elements.length === 0) return null;
    // En el diario, la doble página en pequeño (papel, fecha y contenido en su sitio).
    if (this.book) {
      const spread = this.renderSpread(
        { id: '', elements, book: this.book },
        width / (PAGE_WIDTH * 2),
      );
      return spread.toDataURL('image/webp', 0.85);
    }
    const canvas = renderElements(elements, { mode: 'light', assets: this.assets, width, height });
    return canvas.toDataURL('image/webp', 0.8);
  }

  /** Dónde están las dos páginas en la ventana (px), para animar la entrada al mapa. */
  bookScreenRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.book) return null;
    const a = worldToScreen(this.camera, { x: -PAGE_WIDTH, y: -PAGE_HEIGHT / 2 });
    const b = worldToScreen(this.camera, { x: PAGE_WIDTH, y: PAGE_HEIGHT / 2 });
    return { x: a.x + this.origin.x, y: a.y + this.origin.y, width: b.x - a.x, height: b.y - a.y };
  }

  /** Sustituye toda la página (p. ej. al abrir una copia). Se puede deshacer. */
  replaceAll(elements: SceneElement[]) {
    this.finishEditing(false);
    this.setSelection([]);
    const changes: Changes = new Map(this.scene.all().map((el) => [el.id, null]));
    for (const el of elements) changes.set(el.id, el);
    this.history.commit(changes);
    this.zoomToFit();
  }

  /** Imagen PNG de toda la página (o null si está vacía). */
  exportPng(): Promise<Blob | null> {
    const elements = this.scene.all();
    if (elements.length === 0) return Promise.resolve(null);
    return elementsToPng(elements, {
      mode: this.theme.mode,
      assets: this.assets,
      background: this.theme.background,
    });
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.cleanups.forEach((fn) => fn());
    this.unwatchDpr();
    this.cameraListeners.clear();
    this.stateListeners.clear();
    this.editingListeners.clear();
  }

  /** Añade copias desplazadas (ids nuevos, encima de todo, mismo orden) y las selecciona. */
  private insertCopies(elements: SceneElement[], dx: number, dy: number) {
    let z = this.scene.nextZ();
    // Las copias forman grupos nuevos (no se mezclan con los originales).
    const groups = new Map<string, string>();
    const groupFor = (id: string | null) => {
      if (!id) return null;
      if (!groups.has(id)) groups.set(id, createId());
      return groups.get(id)!;
    };
    // Las flechas copiadas se enganchan a las copias (o se sueltan si no se copió su elemento).
    const ids = new Map(elements.map((el) => [el.id, createId()]));
    const rebind = (b: ArrowBinding | null) =>
      b && ids.has(b.elementId) ? { ...b, elementId: ids.get(b.elementId)! } : null;
    const copies = [...elements]
      .sort((a, b) => a.z - b.z)
      .map((el): SceneElement => {
        const copy = {
          ...translateElement(el, dx, dy),
          id: ids.get(el.id)!,
          z: z++,
          groupId: groupFor(el.groupId),
          locked: false,
        };
        return copy.type === 'arrow'
          ? { ...copy, start: rebind(copy.start), end: rebind(copy.end) }
          : copy;
      });
    this.history.commit(new Map(copies.map((el) => [el.id, el])));
    this.setSelection(copies.map((el) => el.id));
  }

  private selectedElements(): SceneElement[] {
    const result: SceneElement[] = [];
    for (const id of this.selection) {
      const el = this.scene.get(id);
      if (el) result.push(el);
    }
    return result;
  }

  /** Selecciona, añadiendo siempre el resto de miembros de cada grupo. */
  private setSelection(ids: Iterable<string>) {
    const next = new Set(ids);
    const groups = new Set<string>();
    for (const id of next) {
      const groupId = this.scene.get(id)?.groupId;
      if (groupId) groups.add(groupId);
    }
    if (groups.size > 0) {
      for (const el of this.scene.all()) {
        if (el.groupId && groups.has(el.groupId)) next.add(el.id);
      }
    }
    const same =
      next.size === this.selection.size && [...next].every((id) => this.selection.has(id));
    if (same) return;
    this.selection = next;
    this.invalidateOverlay();
    this.emitState();
  }

  // ─── Herramientas ─────────────────────────────────────────────

  private createToolContext(): ToolContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    return {
      get camera() {
        return engine.camera;
      },
      get scene() {
        return engine.scene;
      },
      get styles() {
        return engine.styles;
      },
      get mode() {
        return engine.theme.mode;
      },
      get colors() {
        return { accent: engine.theme.accent, handleFill: engine.theme.handleFill };
      },
      get selection() {
        return engine.selection;
      },
      setSelection: (ids) => this.setSelection(ids),
      commit: (changes) => this.history.commit(changes),
      preview: (changes) => {
        this.scene.apply(changes);
        this.invalidateScene();
        this.invalidateOverlay();
      },
      commitPreview: (originals) => {
        // Estado final → restaurar el original → aplicarlo con historial (un solo deshacer).
        const final: Changes = new Map();
        let changed = false;
        for (const [id, original] of originals) {
          const current = this.scene.get(id) ?? null;
          final.set(id, current);
          if (current !== original) changed = true;
        }
        this.scene.apply(originals);
        if (changed) this.history.commit(final);
        else this.invalidateScene();
      },
      cancelPreview: (originals) => {
        this.scene.apply(originals);
        this.invalidateScene();
        this.invalidateOverlay();
      },
      startEditing: (element, isNew) => this.startEditing(element, isNew),
      requestTool: (tool) => this.toolRequest(tool),
      invalidateScene: () => this.invalidateScene(),
      invalidateOverlay: () => this.invalidateOverlay(),
    };
  }

  private get activeHandler(): ToolHandler | undefined {
    return this.handlers[this.tool];
  }

  private engineState(): EngineState {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isEmpty: this.pageElements().length === 0,
      selectionCount: this.selection.size,
      selectionStyle: this.selectionStyle(),
      selectionGrouped: this.selectedElements().some((el) => el.groupId),
      selectionLocked: this.selection.size > 0 && this.selectedElements().every((el) => el.locked),
      hasLocked: this.scene.all().some((el) => el.locked),
      hasCopiedStyle: this.copiedStyle !== null,
      selectionHasLink: this.selectedElements().some((el) => el.link),
      selectionLink: (() => {
        const links = this.selectedElements().map((el) => el.link ?? null);
        return links.length > 0 && links.every((l) => l === links[0]) ? links[0] : null;
      })(),
    };
  }

  private selectionStyle(): SelectionStyle | null {
    const all = this.selectedElements();
    if (all.length === 0) return null;
    const common = <T>(values: T[]) =>
      values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null;
    const of = <K extends SceneElement['type']>(...types: K[]) =>
      all.filter((el): el is Extract<SceneElement, { type: K }> => types.includes(el.type as K));

    const strokes = of('stroke');
    const shapes = of('shape');
    const texts = of('text');
    const notes = of('note');
    const arrows = of('arrow');
    const ink = [...strokes, ...texts, ...shapes, ...arrows];
    const fillable = [...shapes, ...strokes.filter(isClosedStroke)];
    const labelled = [...shapes, ...strokes].flatMap((el) => (el.label ? [el.label] : []));
    const typed = [...texts, ...notes, ...labelled];

    // El tamaño solo se puede cambiar si todo es del mismo "tipo de tamaño".
    const lined = [...strokes, ...shapes, ...arrows];
    const lettered = [...texts, ...notes];
    const rest = all.length - lined.length - lettered.length - of('image').length;
    let sizeKind: SizedKind | null = null;
    let size: number | null = null;
    if (rest === 0 && lined.length > 0 && lettered.length === 0) {
      sizeKind = strokes.some((el) => el.kind === 'marker') ? 'marker' : 'pen';
      const first = lined[0];
      size = first.type === 'shape' ? first.strokeWidth : first.size;
    } else if (rest === 0 && lettered.length > 0 && lined.length === 0) {
      sizeKind = 'text';
      size = lettered[0].fontSize;
    }

    return {
      hasInk: ink.length > 0,
      color: common(ink.map((el) => el.color)),
      hasNotes: notes.length > 0,
      noteColor: common(notes.map((el) => el.color)),
      noteVariant: common(notes.map((el) => el.variant)),
      noteTextColor: notes.length > 0 ? common(notes.map((el) => el.textColor ?? 'auto')) : null,
      hasText: typed.length > 0,
      font: common(typed.map((t) => t.font)),
      align: common(typed.map((t) => t.align)),
      valign: common([...notes, ...labelled].map((t) => t.valign)),
      hasFill: fillable.length > 0,
      fill: fillable.length > 0 ? common(fillable.map((el) => el.fill ?? 'none')) : null,
      fillStyle: common(fillable.filter((el) => el.fill).map((el) => el.fillStyle)),
      hasShapes: shapes.length > 0,
      hasArrows: arrows.length > 0,
      startHead: common(arrows.map((el) => el.startHead)),
      endHead: common(arrows.map((el) => el.endHead)),
      border: common(shapes.map((el) => el.border)),
      inkIsShapes: shapes.length > 0 && shapes.length === ink.length,
      roughness: common([...shapes, ...arrows].map((el) => el.roughness)),
      hasLabels: labelled.length > 0,
      labelSize: labelled[0]?.fontSize ?? null,
      sizeKind,
      size,
      opacity: all[0].opacity,
    };
  }

  private emitState() {
    const state = this.engineState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  private onHistoryChange() {
    // Deshacer puede quitar elementos seleccionados.
    const alive = [...this.selection].filter((id) => this.scene.get(id));
    if (alive.length !== this.selection.size) this.selection = new Set(alive);
    this.invalidateScene();
    this.invalidateOverlay();
    this.emitState();
  }

  /** Termina (confirmando) lo que la herramienta estuviera haciendo. */
  private endToolGesture() {
    const gesture = this.gesture;
    if (gesture?.type !== 'tool') return;
    this.gesture = null;
    gesture.handler.onUp();
  }

  // ─── Entrada ──────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    if (this.gesture) return;
    // Mientras la hoja cae sola no se puede tocar el lienzo.
    if (this.pageTurner.busy) {
      e.preventDefault();
      return;
    }
    // Agarrar la esquina de la hoja para pasar página (con cualquier herramienta).
    if (e.button === 0 && !this.editing && !this.spaceHeld && this.tool !== 'hand') {
      const world = screenToWorld(this.camera, this.localPoint(e));
      // La etiqueta de un enlace lleva a su página.
      const link = this.linkUnder(world);
      if (link) {
        e.preventDefault();
        this.linkListener(link);
        return;
      }
      // La casilla de una tarea se marca o se desmarca (sin seleccionar nada).
      const task = this.taskUnder(world);
      if (task) {
        e.preventDefault();
        const toggled = withTaskToggled(task.el, task.paragraph);
        this.history.commit(new Map([[toggled.id, toggled]]));
        return;
      }
      // Una pestaña lleva a su página.
      const tab = this.book && tabAt(this.book, world);
      if (tab) {
        e.preventDefault();
        if (!tab.current) this.bookTabListener(tab.pageId);
        return;
      }
      if (this.book && this.pageTurner.grab(world, this.camera.zoom)) {
        e.preventDefault();
        try {
          this.overlayCanvas.setPointerCapture(e.pointerId);
        } catch {
          // No es crítico.
        }
        this.stopMotion();
        this.gesture = { type: 'turn', pointerId: e.pointerId };
        this.updateCursor();
        return;
      }
    }
    if (this.editing && e.button === 0) {
      e.preventDefault();
      // Clic dentro de lo que se edita (p. ej. el borde de la nota o un doble clic):
      // se sigue escribiendo. Un clic fuera cierra el editor y no hace nada más.
      const world = screenToWorld(this.camera, this.localPoint(e));
      if (!elementHitsSegment(this.editing.element, world, world, 0)) this.finishEditing();
      return;
    }
    const wantsPan = e.button === 1 || (e.button === 0 && (this.tool === 'hand' || this.spaceHeld));
    const handler = e.button === 0 ? this.activeHandler : undefined;
    if (!wantsPan && !handler) return;

    e.preventDefault();
    try {
      // Seguir recibiendo el movimiento aunque el ratón salga de la ventana.
      this.overlayCanvas.setPointerCapture(e.pointerId);
    } catch {
      // Puntero ya inactivo (p. ej. eventos sintéticos): no es crítico.
    }
    this.stopMotion();

    if (wantsPan) {
      const p = this.localPoint(e);
      this.gesture = {
        type: 'pan',
        pointerId: e.pointerId,
        last: p,
        samples: [{ t: e.timeStamp, ...p }],
      };
      this.updateCursor();
    } else if (handler) {
      this.gesture = { type: 'tool', pointerId: e.pointerId, handler };
      handler.onDown(this.pointerInput(e));
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    this.lastPointer = this.localPoint(e);
    const gesture = this.gesture;
    if (!gesture) {
      this.updateHover(e);
      return;
    }
    if (e.pointerId !== gesture.pointerId) return;

    if (gesture.type === 'turn') {
      this.pageTurner.drag(screenToWorld(this.camera, this.localPoint(e)));
      return;
    }
    if (gesture.type === 'tool') {
      // Los eventos agrupados traen todos los puntos intermedios: trazos más finos.
      const events = e.getCoalescedEvents?.() ?? [];
      gesture.handler.onMove((events.length > 0 ? events : [e]).map((ev) => this.pointerInput(ev)));
      return;
    }

    const p = this.localPoint(e);
    this.setCamera(panBy(this.camera, p.x - gesture.last.x, p.y - gesture.last.y));
    gesture.last = p;
    gesture.samples.push({ t: e.timeStamp, ...p });
    while (gesture.samples.length > 2 && e.timeStamp - gesture.samples[0].t > 100) {
      gesture.samples.shift();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    this.gesture = null;
    if (this.overlayCanvas.hasPointerCapture(e.pointerId)) {
      this.overlayCanvas.releasePointerCapture(e.pointerId);
    }

    if (gesture.type === 'turn') {
      if (e.type === 'pointercancel') this.pageTurner.cancel();
      else this.pageTurner.release();
      this.updateCursor();
      return;
    }
    if (gesture.type === 'tool') {
      if (e.type === 'pointercancel') gesture.handler.onCancel();
      else gesture.handler.onUp();
      return;
    }

    // Si se suelta en movimiento, el lienzo sigue deslizándose un poco.
    const first = gesture.samples[0];
    const last = gesture.samples[gesture.samples.length - 1];
    const dt = last.t - first.t;
    if (e.type === 'pointerup' && dt > 0 && e.timeStamp - last.t < 50) {
      const v = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
      if (Math.hypot(v.x, v.y) > INERTIA_START_SPEED) {
        this.inertia = v;
        this.requestFrame();
      }
    }
    this.updateCursor();
  };

  private onWheel = (e: WheelEvent) => {
    const zooming = e.ctrlKey || e.metaKey;
    const target = e.target instanceof Element ? e.target : null;
    if (!zooming && target?.closest('[data-scrollable]')) return;
    e.preventDefault(); // también bloquea el zoom del navegador con Ctrl+rueda

    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.height : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    const p = this.localPoint(e);
    this.inertia = null;
    this.tween = null;

    if (zooming) {
      const smooth = Math.abs(dy) >= WHEEL_SMOOTH_THRESHOLD;
      const factor = Math.exp(-dy * (smooth ? WHEEL_ZOOM_SPEED : PINCH_ZOOM_SPEED));
      const base = this.zoomAnim?.target ?? this.camera.zoom;
      const zoom = clampZoom(base * factor);
      if (smooth) {
        this.zoomAnim = { target: zoom, anchor: p };
        this.requestFrame();
      } else {
        this.zoomAnim = null;
        this.setCamera(zoomAt(this.camera, p, zoom));
      }
      return;
    }

    if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    if (Math.abs(dx) >= WHEEL_SMOOTH_THRESHOLD || Math.abs(dy) >= WHEEL_SMOOTH_THRESHOLD) {
      this.pendingPan = { x: this.pendingPan.x - dx, y: this.pendingPan.y - dy };
      this.requestFrame();
    } else {
      this.setCamera(panBy(this.camera, -dx, -dy));
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || isEditableTarget(e.target)) return;
    e.preventDefault();
    if (!this.spaceHeld) {
      this.spaceHeld = true;
      this.updateCursor();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    this.spaceHeld = false;
    this.updateCursor();
  };

  private onBlur = () => {
    this.spaceHeld = false;
    this.endToolGesture();
    this.gesture = null;
    this.updateCursor();
  };

  private zoomBy(factor: number) {
    const base = this.zoomAnim?.target ?? this.camera.zoom;
    this.tween = null;
    this.zoomAnim = {
      target: clampZoom(base * factor),
      anchor: { x: this.viewport.width / 2, y: this.viewport.height / 2 },
    };
    this.requestFrame();
  }

  /** Suelta el gesto en curso (se descarta lo que estuviera a medias). */
  private cancelGesture() {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    if (this.overlayCanvas.hasPointerCapture(gesture.pointerId)) {
      this.overlayCanvas.releasePointerCapture(gesture.pointerId);
    }
    if (gesture.type === 'tool') gesture.handler.onCancel();
  }

  private stopMotion() {
    this.inertia = null;
    this.tween = null;
    this.zoomAnim = null;
    this.pendingPan = { x: 0, y: 0 };
  }

  private pointerInput(e: PointerEvent): PointerInput {
    const screen = this.localPoint(e);
    return {
      screen,
      world: screenToWorld(this.camera, screen),
      pressure: e.pressure,
      pointerType: e.pointerType,
      time: e.timeStamp,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    };
  }

  /** Pregunta a la herramienta qué cursor mostrar según lo que hay bajo el ratón. */
  private updateHover(e: PointerEvent) {
    const handler = this.activeHandler;
    // Cerca de la esquina de una hoja, esta se levanta y se puede agarrar.
    const canTurn = !!this.book && !this.editing && !this.spaceHeld && this.tool !== 'hand';
    if (canTurn) this.pageTurner.setScale(this.dpr * this.camera.zoom);
    const world = screenToWorld(this.camera, this.localPoint(e));
    const onCorner = this.pageTurner.hover(canTurn ? world : null, this.camera.zoom);
    const onTab =
      (canTurn && !!this.book && tabAt(this.book, world) !== null) ||
      (!this.editing && (this.linkUnder(world) !== null || this.taskUnder(world) !== null));
    const cursor = onCorner
      ? 'grab'
      : onTab
        ? 'pointer'
        : !this.spaceHeld && handler?.onHover
          ? handler.onHover(this.pointerInput(e))
          : null;
    if (cursor !== this.hoverCursor) {
      this.hoverCursor = cursor;
      this.updateCursor();
    }
  }

  // ─── Animación ────────────────────────────────────────────────

  private tick = (now: number) => {
    this.frame = 0;
    const dt = this.lastTick ? Math.min(now - this.lastTick, 50) : 16;
    this.lastTick = now;

    // Todas las animaciones avanzan en cada frame (no cortocircuitar).
    const steps = [
      this.stepTween(now),
      this.stepZoom(dt),
      this.stepPan(dt),
      this.stepInertia(dt),
      this.pageTurner.step(now),
    ];
    if (this.pageTurner.active) this.overlayDirty = true;
    const toolAnimating = this.activeHandler?.isAnimating?.(now) ?? false;
    if (toolAnimating) this.overlayDirty = true;
    if (this.highlight && now - this.highlight.start > HIGHLIGHT_DURATION) {
      // Un último frame para borrarlo.
      this.highlight = null;
      this.overlayDirty = true;
    }
    const highlighting = this.highlight !== null;
    if (highlighting) this.overlayDirty = true;

    if (this.sceneDirty) {
      this.renderScene();
      this.sceneDirty = false;
    }
    if (this.overlayDirty) {
      this.renderOverlay(now);
      this.overlayDirty = false;
    }

    if (toolAnimating || highlighting || steps.some(Boolean)) this.requestFrame();
    else this.lastTick = 0;
  };

  private stepTween(now: number): boolean {
    if (!this.tween) return false;
    const { from, to, start, duration } = this.tween;
    const t = clamp((now - start) / duration, 0, 1);
    this.setCamera(interpolateCamera(from, to, easeOutCubic(t), this.viewport));
    if (t < 1) return true;
    this.tween = null;
    return false;
  }

  private stepZoom(dt: number): boolean {
    if (!this.zoomAnim) return false;
    const { target, anchor } = this.zoomAnim;
    const current = Math.log(this.camera.zoom);
    const goal = Math.log(target);
    const done = Math.abs(goal - current) < 0.001;
    const zoom = done
      ? target
      : Math.exp(current + (goal - current) * smoothingFactor(dt, ZOOM_TAU));
    this.setCamera(zoomAt(this.camera, anchor, zoom));
    if (!done) return true;
    this.zoomAnim = null;
    return false;
  }

  private stepPan(dt: number): boolean {
    const { x, y } = this.pendingPan;
    if (x === 0 && y === 0) return false;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
      this.pendingPan = { x: 0, y: 0 };
      this.setCamera(panBy(this.camera, x, y));
      return false;
    }
    const k = smoothingFactor(dt, PAN_TAU);
    this.pendingPan = { x: x - x * k, y: y - y * k };
    this.setCamera(panBy(this.camera, x * k, y * k));
    return true;
  }

  private stepInertia(dt: number): boolean {
    const v = this.inertia;
    if (!v) return false;
    this.setCamera(panBy(this.camera, v.x * dt, v.y * dt));
    const decay = Math.exp(-dt / INERTIA_TAU);
    this.inertia = { x: v.x * decay, y: v.y * decay };
    if (Math.hypot(this.inertia.x, this.inertia.y) > INERTIA_MIN_SPEED) return true;
    this.inertia = null;
    return false;
  }

  // ─── Dibujo ───────────────────────────────────────────────────

  private setCamera(camera: Camera) {
    this.camera = camera;
    this.invalidateScene();
    this.invalidateOverlay();
    this.cameraListeners.forEach((listener) => listener(camera));
  }

  private invalidateScene() {
    this.sceneDirty = true;
    this.requestFrame();
  }

  private invalidateOverlay() {
    this.overlayDirty = true;
    this.requestFrame();
  }

  private requestFrame() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private visibleBounds(): Bounds {
    const { x, y, zoom } = this.camera;
    return {
      minX: x,
      minY: y,
      maxX: x + this.viewport.width / zoom,
      maxY: y + this.viewport.height / zoom,
    };
  }

  /** Transformación mundo → píxeles físicos del canvas. */
  private applyWorldTransform(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.camera.zoom;
    ctx.setTransform(k, 0, 0, k, -this.camera.x * k, -this.camera.y * k);
  }

  private renderScene() {
    const { sceneCtx: ctx, sceneCanvas: canvas, dpr } = this;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawDesk(ctx, canvas);

    const book = this.book;
    const pixelScale = this.dpr * this.camera.zoom;
    if (!book && !this.deskLayer) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawDotGrid(
        ctx,
        this.camera,
        this.viewport.width,
        this.viewport.height,
        dpr,
        this.theme.dots,
      );
    }

    this.applyWorldTransform(ctx);
    if (book) drawBook(ctx, book, this.theme.mode, pixelScale);
    const handler = this.activeHandler;
    const editing = this.editing?.element ?? null;
    const rc: RenderContext = {
      mode: this.theme.mode,
      pixelScale,
      assets: this.assets,
      editingId: editing?.id ?? null,
    };
    for (const el of this.scene.search(this.visibleBounds())) {
      // Lo que se edita se pinta con su versión actual (puede haber crecido).
      if (el.id === editing?.id) continue;
      drawElement(ctx, el, rc, handler?.elementOpacity?.(el.id) ?? 1);
    }
    // Notas y figuras (el texto lo pinta el editor); un texto suelto es solo el editor.
    if (editing && editing.type !== 'text') drawElement(ctx, editing, rc);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (book) drawBinding(ctx, book, pixelScale);
    // Etiquetas de los enlaces, siempre encima (y del mismo tamaño en pantalla).
    for (const badge of this.visibleBadges()) {
      drawLinkBadge(ctx, badge, this.camera.zoom, this.theme.accent);
    }
  }

  /**
   * La mesa: su textura pegada al mundo (se mueve con el libro). De muy lejos se funde
   * con su color, para que no parpadee.
   */
  private drawDesk(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const { mode } = this.theme;
    if (this.deskLayer) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (this.transparentDesk) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = mode === 'dark' ? 'rgba(0, 0, 0, 0.38)' : 'rgba(24, 18, 12, 0.22)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const style = this.book?.style.desk ?? 'plain';
    ctx.fillStyle = deskColor(style, mode) ?? this.theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = deskTexture(style, mode);
    if (!texture) return;
    const k = this.dpr * this.camera.zoom * DESK_SCALE[style];
    const alpha = clamp((k - 0.2) / 0.25, 0, 1);
    if (alpha === 0) return;
    let pattern = this.deskPatterns.get(texture);
    if (!pattern) {
      pattern = ctx.createPattern(texture, 'repeat') ?? undefined;
      if (!pattern) return;
      this.deskPatterns.set(texture, pattern);
    }
    const scale = this.dpr * this.camera.zoom;
    pattern.setTransform(
      new DOMMatrix([k, 0, 0, k, -this.camera.x * scale, -this.camera.y * scale]),
    );
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  private renderOverlay(now: number) {
    const { overlayCtx: ctx, overlayCanvas: canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const handler = this.activeHandler;
    if (handler?.renderOverlay) {
      this.applyWorldTransform(ctx);
      handler.renderOverlay(ctx, now);
    }
    if (this.highlight) {
      this.applyWorldTransform(ctx);
      this.drawHighlight(ctx, now);
    }
    // La hoja que se está pasando (las anillas quedan entre la página de debajo y la hoja).
    if (this.pageTurner.active && this.book) {
      this.applyWorldTransform(ctx);
      const pixelScale = this.dpr * this.camera.zoom;
      const book = this.book;
      this.pageTurner.draw(ctx, pixelScale, () => drawBinding(ctx, book, pixelScale));
    }
  }

  /** Brillo alrededor de lo señalado: una onda que se abre y un marco que se apaga. */
  private drawHighlight(ctx: CanvasRenderingContext2D, now: number) {
    const highlight = this.highlight;
    const el = highlight && this.scene.get(highlight.id);
    if (!highlight || !el) return;
    const t = (now - highlight.start) / HIGHLIGHT_DURATION;
    if (t < 0) return;
    const b = elementBounds(el);
    const zoom = this.camera.zoom;
    const rect = (pad: number) => {
      ctx.beginPath();
      ctx.roundRect(
        b.minX - pad / zoom,
        b.minY - pad / zoom,
        b.maxX - b.minX + (pad * 2) / zoom,
        b.maxY - b.minY + (pad * 2) / zoom,
        (pad + 4) / zoom,
      );
    };
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.fillStyle = this.theme.accent;
    const wave = easeOutCubic(clamp(t / 0.55, 0, 1));
    ctx.globalAlpha = 0.55 * (1 - wave);
    ctx.lineWidth = 2 / zoom;
    rect(8 + 28 * wave);
    ctx.stroke();
    const alpha = clamp(t / 0.1, 0, 1) * clamp((1 - t) / 0.4, 0, 1);
    rect(8);
    ctx.globalAlpha = alpha * 0.12;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2.5 / zoom;
    ctx.stroke();
    ctx.restore();
  }

  private resize() {
    const rect = this.overlayCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.origin = { x: rect.left, y: rect.top };
    this.viewport = { width: rect.width, height: rect.height };
    this.dpr = dpr;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    for (const canvas of [this.sceneCanvas, this.overlayCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }

    if (!this.sized && rect.width > 0 && rect.height > 0) {
      this.sized = true;
      this.setCamera(cameraAt({ x: 0, y: 0 }, 1, this.viewport));
    } else if (this.lockedCamera && rect.width > 0) {
      this.setCamera(this.lockedCamera());
    } else if (this.fitOnResize && rect.width > 0) {
      const target = this.fitOnResize;
      this.fitOnResize = null;
      this.stopMotion();
      this.setCamera(target());
    }
    // Cambiar el tamaño borra los canvas: redibujar ya para evitar un parpadeo.
    const now = performance.now();
    this.renderScene();
    this.renderOverlay(now);
    this.sceneDirty = false;
    this.overlayDirty = false;
  }

  /** Vuelve a medir si cambia la densidad de píxeles (p. ej. al mover la ventana a otra pantalla). */
  private watchDpr() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      this.resize();
      this.watchDpr();
    };
    query.addEventListener('change', onChange, { once: true });
    this.unwatchDpr = () => query.removeEventListener('change', onChange);
  }

  private updateCursor() {
    let cursor: string;
    if (this.gesture?.type === 'pan' || this.gesture?.type === 'turn') cursor = 'grabbing';
    else if (this.spaceHeld) cursor = 'grab';
    else cursor = this.hoverCursor ?? this.toolCursor();
    if (this.overlayCanvas.style.cursor !== cursor) this.overlayCanvas.style.cursor = cursor;
  }

  private toolCursor(): string {
    const { mode } = this.theme;
    const contrast = mode === 'dark' ? '#ffffff' : '#000000';
    switch (this.tool) {
      case 'pen':
      case 'marker': {
        const { color, size } = this.styles[this.tool];
        const opacity = this.tool === 'marker' ? 0.5 : 1;
        return brushCursor(size, resolveColor(color, mode), opacity, contrast);
      }
      case 'eraser':
        return eraserCursor(ERASER_RADIUS, contrast);
      default:
        return TOOL_CURSORS[this.tool];
    }
  }

  private localPoint(e: MouseEvent): Vec {
    return { x: e.clientX - this.origin.x, y: e.clientY - this.origin.y };
  }

  private listen<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (e: E) => void,
    options?: AddEventListenerOptions,
  ) {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }
}
