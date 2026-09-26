import type { Camera } from '../camera';
import type { EditableElement, ToolStyles } from '../elements';
import type { Vec } from '../math';
import type { ThemeMode } from '../palette';
import type { Changes, Scene } from '../scene';
import type { SelectionColors } from '../selection';
import type { ToolId } from '../tools';

export interface PointerInput {
  world: Vec;
  screen: Vec;
  pressure: number;
  pointerType: string;
  /** Event timestamp (same clock as requestAnimationFrame). */
  time: number;
  shiftKey: boolean;
  altKey: boolean;
}

/** What the engine offers each tool. */
export interface ToolContext {
  readonly camera: Camera;
  readonly scene: Scene;
  readonly styles: ToolStyles;
  /** Side of new notes, in screen pixels. */
  readonly noteSize: number;
  readonly mode: ThemeMode;
  readonly colors: SelectionColors;
  readonly selection: ReadonlySet<string>;
  setSelection(ids: Iterable<string>): void;
  commit(changes: Changes): void;
  /** Applies provisional changes (while dragging) without going through the history. */
  preview(changes: Changes): void;
  /** Confirms what was previewed as a single undo step. `originals` = previous state. */
  commitPreview(originals: Changes): void;
  /** Discards what was previewed and restores `originals`. */
  cancelPreview(originals: Changes): void;
  /** Asks the UI to change the tool (e.g. back to select). */
  requestTool(tool: ToolId): void;
  /** Opens the text editor on a text or a note (new or existing). */
  startEditing(element: EditableElement, isNew: boolean): void;
  /** Redraw the content layer. */
  invalidateScene(): void;
  /** Redraw the top layer (stroke in progress, selection, eraser trail…). */
  invalidateOverlay(): void;
}

/** A tool's behaviour. */
export interface ToolHandler {
  onDown(input: PointerInput): void;
  /** Receives all the intermediate points (coalesced events) since the last move. */
  onMove(inputs: PointerInput[]): void;
  onUp(): void;
  onCancel(): void;
  /** Movement without buttons pressed. Returns the cursor to show, or null for the tool's. */
  onHover?(input: PointerInput): string | null;
  /** Draws on the top layer. The context already has the world transform. */
  renderOverlay?(ctx: CanvasRenderingContext2D, now: number): void;
  /** Opacity to paint an element with (e.g. dimmed while erasing). */
  elementOpacity?(id: string): number;
  /** Does it need more frames even without events (animations)? */
  isAnimating?(now: number): boolean;
}
