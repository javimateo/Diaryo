import {
  cameraAt,
  cameraCenter,
  clampZoom,
  fitCamera,
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
import { defaultLabel, isContainer, textOf, withText } from './containers';
import { createText, fitEditable, isEditable } from './editing';
import {
  createId,
  DEFAULT_STYLES,
  type ArrowBinding,
  elementBounds,
  type EditableElement,
  type ImageElement,
  NOTE_SIZE,
  type SceneElement,
  type ToolStyles,
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
import type { Size, Vec } from './math';
import { BUILTIN_FONTS, fonts } from './fonts';
import { resolveColor } from './palette';
import { drawElement, type RenderContext } from './render';
import { Scene, type Changes } from './scene';
import { elementHitsSegment } from './hit';
import { containerAt, hitTestElement } from './selection';
import { applyStyle, patchMergeKey, type StylePatch } from './restyle';
import { clearTextCache } from './text';
import { taskAt, withTaskToggled } from './tasks';
import { drawBackdrop, drawHighlight, type Backdrop } from './drawing';
import { TOOL_CURSORS, type ToolId } from './tools';
import { translateElement } from './transform';
import { CameraMotion } from './cameraMotion';
import { selectionStyle } from './selectionStyle';
import type {
  ContextMenuRequest,
  DeskView,
  EditingState,
  EngineCanvases,
  EngineOptions,
  EngineState,
  EngineTheme,
  ScreenRect,
} from './types';

export type {
  ContextMenuRequest,
  DeskView,
  EditingState,
  EngineCanvases,
  EngineOptions,
  EngineState,
  EngineTheme,
  ScreenRect,
  SelectionStyle,
} from './types';

type CameraListener = (camera: Camera) => void;
type StateListener = (state: EngineState) => void;
type EditingListener = (state: EditingState | null) => void;

/** Tools that show and keep the selection. */
const SELECTION_TOOLS: ToolId[] = ['select', 'lasso'];

type Gesture =
  | {
      type: 'pan';
      pointerId: number;
      last: Vec;
      /** Recent positions to compute the speed on release (inertia). */
      samples: { t: number; x: number; y: number }[];
    }
  | { type: 'tool'; pointerId: number; handler: ToolHandler }
  | { type: 'turn'; pointerId: number };

/** A mouse wheel makes big jumps (±100); a trackpad, many small ones. */
const WHEEL_SMOOTH_THRESHOLD = 40;
const WHEEL_ZOOM_SPEED = 0.0025;
const PINCH_ZOOM_SPEED = 0.01;
const ZOOM_STEP = 1.25;
const FIT_PADDING = 64;
/** Offset (screen px) of duplicates from the original. */
const DUPLICATE_OFFSET = 16;
/** How long the glow pointing at something lasts (e.g. a search result), in ms. */
const HIGHLIGHT_DURATION = 1800;

/**
 * Canvas engine: draws on two stacked <canvas> and handles the camera, input and tools.
 * It is plain TypeScript (no React) so the drawing loop is as fast as possible; it only
 * redraws the layer that changes.
 */
export class Engine {
  readonly scene = new Scene();
  private readonly history = new History(this.scene, () => this.onHistoryChange());
  /** The page's images (the autosave listens to new ones). */
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
  /** Cursor requested by the tool depending on what is under the mouse (handles, elements…). */
  private hoverCursor: string | null = null;
  /** Last mouse position over the canvas (to paste where it is). */
  private lastPointer: Vec | null = null;
  private editing: EditingState | null = null;
  private readonly editingListeners = new Set<EditingListener>();
  /** The UI decides which tool is active; the engine can only ask for it. */
  private toolRequest: (tool: ToolId) => void = () => {};
  private contextMenuListener: (request: ContextMenuRequest) => void = () => {};
  private copiedStyle: { patch: StylePatch; type: SceneElement['type'] } | null = null;

  private gesture: Gesture | null = null;
  /** What the camera does by itself: smooth zoom and panning, inertia and flights. */
  private readonly motion = new CameraMotion();
  /** The diary double page being written on (null: canvas without a book). */
  private book: BookSpread | null = null;
  private pageTurnListener: (dir: TurnDirection) => void = () => {};
  private bookTabListener: (pageId: string) => void = () => {};
  private linkListener: (pageId: string) => void = () => {};
  /** Name of each page (for the link labels). */
  private linkLabels = new Map<string, string>();
  private missingLinkLabel = '';
  /** The book was framed once: when turning pages the camera stays where it is. */
  private bookFramed = false;
  /** What is pointed at for a moment (e.g. a search result). */
  private highlight: { id: string; start: number } | null = null;
  /** Floating diary: instead of the desk the desktop shows, with a soft veil. */
  private transparentDesk = false;
  private readonly deskLayer: boolean;
  private readonly embedded: boolean;
  private readonly noteSize: number;
  /** Fixed camera: it always frames this (also when the window is resized). */
  private lockedCamera: (() => Camera) | null = null;
  private deskIds: ReadonlySet<string> = new Set();
  /** When the window is resized, frame the whole book again. */
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
    this.embedded = options.embedded ?? false;
    this.noteSize = options.noteSize ?? NOTE_SIZE;
    const transparent = (options.transparent ?? false) || this.deskLayer;
    const sceneCtx = scene.getContext('2d', { alpha: transparent });
    const overlayCtx = overlay.getContext('2d');
    if (!sceneCtx || !overlayCtx) throw new Error('This browser does not support Canvas 2D');
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
    // Prevents Windows autoscroll with the middle button.
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
    this.listen(this.embedded ? overlay : window, 'wheel', this.onWheel, { passive: false });
    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);
    this.listen(window, 'blur', this.onBlur);
    // Embedded, the page scrolls the canvas: pointers are measured from where it is now.
    if (this.embedded) {
      this.listen(window, 'scroll', this.updateOrigin, { passive: true, capture: true });
    }

    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(overlay);
    this.cleanups.push(() => resizeObserver.disconnect());
    this.watchDpr();

    this.resize();
    this.updateCursor();

    // Text measurements depend on the font: redo them when each one finishes loading. The
    // bundled ones are preloaded so they are ready when chosen.
    this.cleanups.push(
      fonts.subscribe(() => {
        clearTextCache();
        this.invalidateScene();
        this.invalidateOverlay();
      }),
    );
    BUILTIN_FONTS.forEach((font) => void fonts.load(font.id));
  }

  // ─── Public API ───────────────────────────────────────────────

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

  /** Back to 100% without moving. */
  resetZoom() {
    this.animateTo(cameraAt(cameraCenter(this.camera, this.viewport), 1, this.viewport));
  }

  /** Frames all the content (and the book). If there is nothing, goes back to the origin. */
  zoomToFit() {
    this.animateTo(this.fitCamera());
  }

  /** Shows the whole double page (without animation, e.g. before turning the page). */
  showWholeBook() {
    if (!this.book) return;
    this.stopMotion();
    this.setCamera(fitCamera(bookBounds(this.book), this.viewport, FIT_PADDING));
  }

  /**
   * Frames `bounds` inside a part of the canvas (`area`, in canvas pixels) without
   * animating: e.g. the book beside the text laid over the canvas (the website demo).
   */
  frameInto(bounds: Bounds, area: ScreenRect, padding = FIT_PADDING) {
    const camera = fitCamera(bounds, area, padding);
    this.stopMotion();
    this.setCamera({
      x: camera.x - area.x / camera.zoom,
      y: camera.y - area.y / camera.zoom,
      zoom: camera.zoom,
    });
  }

  /**
   * Transparent desk (floating diary over the desktop) or the usual one. It is drawn
   * right away, without waiting for the next frame: the window may be hidden and shown
   * right after. The whole book shows or, in the floating diary, the desktop desk view
   * (`view`); it is set again when the window is resized.
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

  /** Goes (animated) to a saved view. */
  animateToView(view: DeskView) {
    this.animateTo(cameraAt(view.center, view.zoom, this.viewport));
  }

  /** What is being viewed: the point at the center of the screen and the zoom. */
  view(): DeskView {
    return { center: cameraCenter(this.camera, this.viewport), zoom: this.camera.zoom };
  }

  /**
   * Fixes the camera framing these bounds, like the floating diary frames the book when
   * it opens: that way the desktop layer puts the desk in the same place.
   */
  lockCamera(bounds: Bounds) {
    this.lock(() => fitCamera(bounds, this.viewport, FIT_PADDING));
  }

  /** Fixes the camera on this view (the last one of the floating diary). */
  lockView(view: DeskView) {
    this.lock(() => cameraAt(view.center, view.zoom, this.viewport));
  }

  private lock(camera: () => Camera) {
    this.lockedCamera = camera;
    this.stopMotion();
    this.setCamera(camera());
  }

  /**
   * Where there is something on screen (in window pixels, with a margin; wider for the
   * selection, because of its handles). In the desktop layer, outside these clicks go
   * through to the desktop.
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

  // ─── Turning pages ────────────────────────────────────────────

  /** Previous and next pages, to be able to turn to them by dragging the corner. */
  setTurnTargets(prev: TurnTarget | null, next: TurnTarget | null) {
    this.pageTurner.setTargets(prev, next);
  }

  // ─── Links to other pages ─────────────────────────────────────

  /** Links the selection to a page (or removes the link with null). */
  setSelectionLink(pageId: string | null): boolean {
    const elements = this.selectedElements();
    if (elements.length === 0) return false;
    this.history.commit(new Map(elements.map((el) => [el.id, { ...el, link: pageId }])));
    return true;
  }

  /** Page names, for the link labels, and what is shown if the page no longer exists. */
  setLinkLabels(labels: Map<string, string>, missing: string) {
    this.linkLabels = labels;
    this.missingLinkLabel = missing;
    this.invalidateScene();
  }

  /** Notifies when a link label is clicked. */
  onLinkOpen(listener: (pageId: string) => void) {
    this.linkListener = listener;
  }

  private linkLabel = (pageId: string): LinkLabel => {
    const text = this.linkLabels.get(pageId);
    return text === undefined
      ? { text: this.missingLinkLabel, missing: true }
      : { text, missing: false };
  };

  /** Link labels of what is visible. */
  private visibleBadges() {
    const elements = this.scene.search(this.visibleBounds()).filter((el) => el.link);
    return linkBadges(elements, this.linkLabel, this.camera.zoom);
  }

  /** Page of the link whose label is under the point, or null. */
  private linkUnder(world: Vec): string | null {
    // On the selection its handles win (its link opens from the panel).
    const badges = this.visibleBadges().filter((b) => !b.ids.some((id) => this.selection.has(id)));
    return badgeAt(badges, world)?.link ?? null;
  }

  /** Task whose checkbox is under the point (topmost first), or null. */
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

  /** Notifies when a marked page's tab is clicked. */
  onBookTab(listener: (pageId: string) => void) {
    this.bookTabListener = listener;
  }

  /** Notifies when a sheet is released past the middle: that page must open. */
  onPageTurn(listener: (dir: TurnDirection) => void) {
    this.pageTurnListener = listener;
  }

  /** Turns the sheet by itself until `target` shows (it stays that way until endPageTurn). */
  animatePageTurn(dir: TurnDirection, target: TurnTarget, duration?: number): Promise<void> {
    if (!this.book) return Promise.resolve();
    this.cancelGesture();
    this.pageTurner.setScale(this.dpr * this.camera.zoom);
    return this.pageTurner.turn(dir, target, duration);
  }

  /** The new page is loaded: the turning sheet is removed. */
  endPageTurn() {
    this.pageTurner.end();
  }

  /** Thumbnail of another page (its double page in small), at that width. */
  spreadThumbnail(target: TurnTarget, width: number): string {
    return this.renderSpread(target, width / (PAGE_WIDTH * 2)).toDataURL('image/webp', 0.85);
  }

  /** Draws a double page (paper and content, without covers) for the turning sheet. */
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
    this.motion.flyTo(this.camera, to, performance.now(), duration);
    this.requestFrame();
  }

  /**
   * Points at an element (e.g. a search result): if it isn't fully visible, the camera
   * goes to it, and it lights up for a moment.
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
    // With the same zoom if it fits; otherwise, just enough to see it whole.
    if (!visible)
      this.animateTo(fitCamera(bounds, this.viewport, FIT_PADDING, this.camera.zoom), flight);
    // The glow starts on arrival.
    this.highlight = { id, start: performance.now() + (visible ? 0 : flight * 0.6) };
    this.invalidateOverlay();
    return true;
  }

  // ─── Selection ────────────────────────────────────────────────

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

  /** Moves the selection a few screen pixels (keyboard arrows). */
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

  /** Clipboard text with the selection, or null if there is no selection. */
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

  /**
   * Pastes what was copied from diaryo under the mouse (or in the center). Returns false
   * if it isn't recognized.
   */
  paste(text: string): boolean {
    const content = parseElements(text);
    if (!content || this.gesture?.type === 'tool') return false;
    for (const [id, src] of Object.entries(content.assets)) this.assets.add(src, id);
    this.insertCentered(content.elements, this.pasteTarget());
    return true;
  }

  /** Creates a text (e.g. when pasting plain text) under the mouse or in the center. */
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
   * Adds images (pasted or dragged). They show at their real screen size, scaled down if
   * they don't fit, and in a row if there are several.
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
   * Changes the color or size of the selection. Consecutive changes of the same kind
   * (dragging the slider) are undone at once.
   */
  restyleSelection(patch: StylePatch) {
    const changes: Changes = new Map();
    for (const el of this.selectedElements()) {
      changes.set(el.id, applyStyle(el, patch, this.camera.zoom));
    }
    this.history.commit(changes, patchMergeKey(patch));
  }

  // ─── Text editing ─────────────────────────────────────────────

  subscribeEditing(listener: EditingListener): () => void {
    this.editingListeners.add(listener);
    listener(this.editing);
    return () => this.editingListeners.delete(listener);
  }

  /** The UI learns that the engine wants to change the tool. */
  onToolRequest(listener: (tool: ToolId) => void) {
    this.toolRequest = listener;
  }

  /** Enter on a selected text or note: edit it. */
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

  /** Change the color or size while writing. */
  updateEditingStyle(patch: StylePatch) {
    const editing = this.editing;
    if (!editing) return;
    const element = applyStyle(editing.element, patch, this.camera.zoom);
    this.setEditing({ ...editing, element: fitEditable(element) });
  }

  /**
   * Closes the editor keeping the result. An empty text is discarded; an empty note is
   * kept (it works as a block of color).
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
    // A shape without text stops having a label.
    if (isContainer(element) && empty) element = { ...element, label: null };
    // Any property counts (text, font, alignment, opacity…).
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
    // A shape without text gets an empty one with the default style.
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
    // Inside a shape (even without a fill) you write in it.
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

  /** Inserts copies of the elements with their common center at `center`. */
  private insertCentered(elements: SceneElement[], center: Vec) {
    const bounds = elements.map(elementBounds).reduce(unionBounds);
    this.insertCopies(
      elements,
      center.x - (bounds.minX + bounds.maxX) / 2,
      center.y - (bounds.minY + bounds.maxY) / 2,
    );
  }

  // ─── Arrange (context menu) ───────────────────────────────────

  /** The engine reports a right-click; the UI shows the menu. */
  onContextMenu(listener: (request: ContextMenuRequest) => void) {
    this.contextMenuListener = listener;
  }

  /** Groups the selection: from now on it is selected and moved together. */
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

  /** Locks (or unlocks, if everything already was) the selection. */
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

  /** Remembers the style of the first selected element to paste it on others. */
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
      // A stroke width makes no sense as a font size (nor the other way round).
      const { size, ...rest } = copied.patch;
      const patch = el.type === copied.type ? copied.patch : rest;
      void size;
      changes.set(el.id, applyStyle(el, patch, this.camera.zoom));
    }
    this.history.commit(changes);
    return true;
  }

  /** Copies the selection as a PNG image (to paste it into other apps). */
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
    // The menu also reaches locked elements (to be able to unlock them).
    const hit = hitTestElement(this.scene, world, 6 / this.camera.zoom, true);
    if (hit && !this.selection.has(hit.id)) this.setSelection([hit.id]);
    if (!hit) this.setSelection([]);
    if (hit && !SELECTION_TOOLS.includes(this.tool)) this.toolRequest('select');
    this.lastPointer = this.localPoint(e);
    this.contextMenuListener({ x: e.clientX, y: e.clientY, onElement: !!hit });
  };

  // ─── Document (load, replace, export) ─────────────────────────

  allElements(): SceneElement[] {
    return this.scene.all();
  }

  /** What belongs to the open page (in the diary, without what is on the desk). */
  pageElements(): SceneElement[] {
    const all = this.scene.all();
    const desk = this.deskIds;
    return this.book ? all.filter((el) => !desk.has(el.id) && isOnPage(elementBounds(el))) : all;
  }

  /**
   * What belongs to the desk (the diary keeps track of it). Even where the book opens, it
   * isn't part of the page.
   */
  setDeskIds(ids: ReadonlySet<string>) {
    this.deskIds = ids;
  }

  /**
   * Puts what was saved on the desk (it stays when turning pages) and removes what is no
   * longer there (`removed`). No history.
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
   * Loads a saved page: without undo history and without reporting changes. Without a
   * saved camera, it frames the content (or the origin if it is empty).
   */
  loadPage(elements: SceneElement[], camera?: Camera | null) {
    this.cancelGesture();
    this.finishEditing(false);
    this.setSelection([]);
    // In the diary, what is on the desk stays: only what is inside the book changes.
    const leaving = this.book ? this.pageElements() : this.scene.all();
    const changes: Changes = new Map(leaving.map((el) => [el.id, null]));
    for (const el of elements) changes.set(el.id, el);
    const notify = this.scene.onChange;
    this.scene.onChange = () => {};
    this.scene.apply(changes);
    this.scene.onChange = notify;
    this.history.clear();
    this.stopMotion();
    // In the diary, the book doesn't move when turning pages (the first time it is
    // framed). With the fixed camera, neither.
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

  /** Thumbnail of the whole page (always in the light theme), or null if it is empty. */
  thumbnail(width: number, height: number): string | null {
    const elements = this.pageElements();
    if (elements.length === 0) return null;
    // In the diary, the double page in small (paper, date and content in place).
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

  /** Where the two pages are in the window (px), to animate entering the map. */
  bookScreenRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.book) return null;
    const a = worldToScreen(this.camera, { x: -PAGE_WIDTH, y: -PAGE_HEIGHT / 2 });
    const b = worldToScreen(this.camera, { x: PAGE_WIDTH, y: PAGE_HEIGHT / 2 });
    return { x: a.x + this.origin.x, y: a.y + this.origin.y, width: b.x - a.x, height: b.y - a.y };
  }

  /** Replaces the whole page (e.g. when opening a backup). It can be undone. */
  replaceAll(elements: SceneElement[]) {
    this.finishEditing(false);
    this.setSelection([]);
    const changes: Changes = new Map(this.scene.all().map((el) => [el.id, null]));
    for (const el of elements) changes.set(el.id, el);
    this.history.commit(changes);
    this.zoomToFit();
  }

  /** PNG image of the whole page (or null if it is empty). */
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

  /** Adds offset copies (new ids, on top of everything, same order) and selects them. */
  private insertCopies(elements: SceneElement[], dx: number, dy: number) {
    let z = this.scene.nextZ();
    // The copies form new groups (they don't mix with the originals).
    const groups = new Map<string, string>();
    const groupFor = (id: string | null) => {
      if (!id) return null;
      if (!groups.has(id)) groups.set(id, createId());
      return groups.get(id)!;
    };
    // Copied arrows attach to the copies (or are detached if their element wasn't
    // copied).
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

  /** Selects, always adding the other members of each group. */
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

  // ─── Tools ────────────────────────────────────────────────────

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
      noteSize: this.noteSize,
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
        // Final state → restore the original → apply it with history (a single undo).
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
      selectionStyle: selectionStyle(this.selectedElements()),
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

  private emitState() {
    const state = this.engineState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  private onHistoryChange() {
    // Undo may remove selected elements.
    const alive = [...this.selection].filter((id) => this.scene.get(id));
    if (alive.length !== this.selection.size) this.selection = new Set(alive);
    this.invalidateScene();
    this.invalidateOverlay();
    this.emitState();
  }

  /** Ends (confirming) whatever the tool was doing. */
  private endToolGesture() {
    const gesture = this.gesture;
    if (gesture?.type !== 'tool') return;
    this.gesture = null;
    gesture.handler.onUp();
  }

  // ─── Input ────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    if (this.gesture) return;
    // While the sheet falls by itself the canvas can't be touched.
    if (this.pageTurner.busy) {
      e.preventDefault();
      return;
    }
    // Grab the corner of the sheet to turn the page (with any tool).
    if (e.button === 0 && !this.editing && !this.spaceHeld && this.tool !== 'hand') {
      const world = screenToWorld(this.camera, this.localPoint(e));
      // A link label leads to its page.
      const link = this.linkUnder(world);
      if (link) {
        e.preventDefault();
        this.linkListener(link);
        return;
      }
      // A task's checkbox is ticked or unticked (without selecting anything).
      const task = this.taskUnder(world);
      if (task) {
        e.preventDefault();
        const toggled = withTaskToggled(task.el, task.paragraph);
        this.history.commit(new Map([[toggled.id, toggled]]));
        return;
      }
      // A tab leads to its page.
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
          // Not critical.
        }
        this.stopMotion();
        this.gesture = { type: 'turn', pointerId: e.pointerId };
        this.updateCursor();
        return;
      }
    }
    if (this.editing && e.button === 0) {
      e.preventDefault();
      // A click inside what is being edited (e.g. the note's border or a double-click):
      // writing continues. A click outside closes the editor and does nothing else.
      const world = screenToWorld(this.camera, this.localPoint(e));
      if (!elementHitsSegment(this.editing.element, world, world, 0)) this.finishEditing();
      return;
    }
    const wantsPan =
      !this.embedded &&
      (e.button === 1 || (e.button === 0 && (this.tool === 'hand' || this.spaceHeld)));
    const handler = e.button === 0 ? this.activeHandler : undefined;
    if (!wantsPan && !handler) return;

    e.preventDefault();
    try {
      // Keep receiving the movement even if the mouse leaves the window.
      this.overlayCanvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already inactive (e.g. synthetic events): not critical.
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
      // Coalesced events bring all the intermediate points: finer strokes.
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

    // If released while moving, the canvas keeps sliding a bit.
    const first = gesture.samples[0];
    const last = gesture.samples[gesture.samples.length - 1];
    const dt = last.t - first.t;
    if (e.type === 'pointerup' && dt > 0 && e.timeStamp - last.t < 50) {
      const v = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
      if (this.motion.fling(v)) this.requestFrame();
    }
    this.updateCursor();
  };

  private onWheel = (e: WheelEvent) => {
    const zooming = e.ctrlKey || e.metaKey;
    // Embedded, the view is fixed: the wheel scrolls the page.
    if (this.embedded) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!zooming && target?.closest('[data-scrollable]')) return;
    e.preventDefault(); // also blocks the browser zoom with Ctrl+wheel

    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.height : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    const p = this.localPoint(e);
    this.motion.interrupt();

    if (zooming) {
      const smooth = Math.abs(dy) >= WHEEL_SMOOTH_THRESHOLD;
      const factor = Math.exp(-dy * (smooth ? WHEEL_ZOOM_SPEED : PINCH_ZOOM_SPEED));
      const zoom = clampZoom(this.motion.zoomTarget(this.camera.zoom) * factor);
      if (smooth) {
        this.motion.zoomTo(zoom, p);
        this.requestFrame();
      } else {
        this.motion.cancelZoom();
        this.setCamera(zoomAt(this.camera, p, zoom));
      }
      return;
    }

    if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    if (Math.abs(dx) >= WHEEL_SMOOTH_THRESHOLD || Math.abs(dy) >= WHEEL_SMOOTH_THRESHOLD) {
      this.motion.panBy(-dx, -dy);
      this.requestFrame();
    } else {
      this.setCamera(panBy(this.camera, -dx, -dy));
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || isEditableTarget(e.target)) return;
    // Embedded, the view is fixed: the space bar scrolls the page.
    if (this.embedded) return;
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
    const center = { x: this.viewport.width / 2, y: this.viewport.height / 2 };
    this.motion.zoomTo(clampZoom(this.motion.zoomTarget(this.camera.zoom) * factor), center);
    this.requestFrame();
  }

  /** Releases the gesture in progress (whatever was halfway is discarded). */
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
    this.motion.stop();
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

  /** Asks the tool which cursor to show depending on what is under the mouse. */
  private updateHover(e: PointerEvent) {
    const handler = this.activeHandler;
    // Near the corner of a sheet, it lifts and can be grabbed.
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

  // ─── Animation ────────────────────────────────────────────────

  private tick = (now: number) => {
    this.frame = 0;
    const dt = this.lastTick ? Math.min(now - this.lastTick, 50) : 16;
    this.lastTick = now;

    // All the animations advance on every frame (no short-circuiting).
    const motion = this.motion.step(this.camera, this.viewport, now, dt);
    if (motion.camera !== this.camera) this.setCamera(motion.camera);
    const steps = [motion.moving, this.pageTurner.step(now)];
    if (this.pageTurner.active) this.overlayDirty = true;
    const toolAnimating = this.activeHandler?.isAnimating?.(now) ?? false;
    if (toolAnimating) this.overlayDirty = true;
    if (this.highlight && now - this.highlight.start > HIGHLIGHT_DURATION) {
      // One last frame to erase it.
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

  // ─── Drawing ──────────────────────────────────────────────────

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

  /** World → physical canvas pixels transform. */
  private applyWorldTransform(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.camera.zoom;
    ctx.setTransform(k, 0, 0, k, -this.camera.x * k, -this.camera.y * k);
  }

  private renderScene() {
    const { sceneCtx: ctx, sceneCanvas: canvas, dpr } = this;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackdrop(ctx, canvas, this.backdrop(), this.theme, this.camera, this.dpr);

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
      // What is being edited is drawn in its current version (it may have grown).
      if (el.id === editing?.id) continue;
      drawElement(ctx, el, rc, handler?.elementOpacity?.(el.id) ?? 1);
    }
    // Notes and shapes (the editor draws the text); a loose text is only the editor.
    if (editing && editing.type !== 'text') drawElement(ctx, editing, rc);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (book) drawBinding(ctx, book, pixelScale);
    // Link labels, always on top (and the same size on screen).
    for (const badge of this.visibleBadges()) {
      drawLinkBadge(ctx, badge, this.camera.zoom, this.theme.accent);
    }
  }

  /** What goes under everything: the desk, the floating diary veil or nothing. */
  private backdrop(): Backdrop {
    if (this.deskLayer) return { kind: 'clear' };
    if (this.transparentDesk) return { kind: 'veil' };
    return { kind: 'desk', style: this.book?.style.desk ?? 'plain' };
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
    const highlighted = this.highlight && this.scene.get(this.highlight.id);
    if (this.highlight && highlighted) {
      this.applyWorldTransform(ctx);
      const t = (now - this.highlight.start) / HIGHLIGHT_DURATION;
      drawHighlight(ctx, elementBounds(highlighted), t, this.camera.zoom, this.theme.accent);
    }
    // The turning sheet (the rings sit between the page underneath and the sheet).
    if (this.pageTurner.active && this.book) {
      this.applyWorldTransform(ctx);
      const pixelScale = this.dpr * this.camera.zoom;
      const book = this.book;
      this.pageTurner.draw(ctx, pixelScale, () => drawBinding(ctx, book, pixelScale));
    }
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
    // Resizing clears the canvases: redraw right away to avoid a flicker.
    const now = performance.now();
    this.renderScene();
    this.renderOverlay(now);
    this.sceneDirty = false;
    this.overlayDirty = false;
  }

  /**
   * Measures again if the pixel density changes (e.g. when moving the window to another
   * screen).
   */
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

  private updateOrigin = () => {
    const rect = this.overlayCanvas.getBoundingClientRect();
    this.origin = { x: rect.left, y: rect.top };
  };

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
