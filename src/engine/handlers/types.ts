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
  /** Marca de tiempo del evento (mismo reloj que requestAnimationFrame). */
  time: number;
  shiftKey: boolean;
  altKey: boolean;
}

/** Lo que el motor ofrece a cada herramienta. */
export interface ToolContext {
  readonly camera: Camera;
  readonly scene: Scene;
  readonly styles: ToolStyles;
  readonly mode: ThemeMode;
  readonly colors: SelectionColors;
  readonly selection: ReadonlySet<string>;
  setSelection(ids: Iterable<string>): void;
  commit(changes: Changes): void;
  /** Aplica cambios provisionales (mientras se arrastra) sin pasar por el historial. */
  preview(changes: Changes): void;
  /** Confirma lo previsualizado como una sola acción de deshacer. `originals` = estado previo. */
  commitPreview(originals: Changes): void;
  /** Descarta lo previsualizado y restaura `originals`. */
  cancelPreview(originals: Changes): void;
  /** Pide a la interfaz cambiar de herramienta (p. ej. volver a seleccionar). */
  requestTool(tool: ToolId): void;
  /** Abre el editor de texto sobre un texto o una nota (nuevo o existente). */
  startEditing(element: EditableElement, isNew: boolean): void;
  /** Redibujar la capa de contenido. */
  invalidateScene(): void;
  /** Redibujar la capa superior (trazo en curso, selección, rastro del borrador…). */
  invalidateOverlay(): void;
}

/** Comportamiento de una herramienta. */
export interface ToolHandler {
  onDown(input: PointerInput): void;
  /** Recibe todos los puntos intermedios (eventos agrupados) desde el último movimiento. */
  onMove(inputs: PointerInput[]): void;
  onUp(): void;
  onCancel(): void;
  /** Movimiento sin botones pulsados. Devuelve el cursor a mostrar, o null para el de la herramienta. */
  onHover?(input: PointerInput): string | null;
  /** Dibuja en la capa superior. El contexto ya tiene la transformación del mundo. */
  renderOverlay?(ctx: CanvasRenderingContext2D, now: number): void;
  /** Opacidad con la que pintar un elemento (p. ej. atenuado mientras se borra). */
  elementOpacity?(id: string): number;
  /** ¿Necesita más frames aunque no haya eventos (animaciones)? */
  isAnimating?(now: number): boolean;
}
