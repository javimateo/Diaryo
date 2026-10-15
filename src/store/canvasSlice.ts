import type { ToolStyles } from '../engine/elements';
import type { ContextMenuRequest, EditingState, Engine, EngineState } from '../engine/engine';
import type { HexColor } from '../engine/palette';
import type { ToolId } from '../engine/tools';
import { readText, writeJSON } from '../lib/saved';
import { mergeToolStyle, parseRecentColors, parseStyles, RECENT_COLORS_LIMIT } from './styles';
import type { Slice } from './ui';

/** The canvas: the engine, the tool and its styles, what the engine tells. */

const STYLES_KEY = 'diaryo:styles';
const RECENT_COLORS_KEY = 'diaryo:recent-colors';

export interface CanvasSlice {
  engine: Engine | null;
  tool: ToolId;
  styles: ToolStyles;
  /** Custom colors used recently, to get back to them quickly. */
  recentColors: HexColor[];
  zoom: number;
  doc: EngineState;
  /** Text or note being written. */
  editing: EditingState | null;
  /** Right-click menu open. */
  contextMenu: ContextMenuRequest | null;
  setEngine: (engine: Engine | null) => void;
  setTool: (tool: ToolId) => void;
  setToolStyle: <K extends keyof ToolStyles>(tool: K, patch: Partial<ToolStyles[K]>) => void;
  addRecentColor: (color: HexColor) => void;
  setZoom: (zoom: number) => void;
  setDoc: (doc: EngineState) => void;
  setEditing: (editing: EditingState | null) => void;
  openContextMenu: (request: ContextMenuRequest) => void;
  closeContextMenu: () => void;
}

export const canvasSlice: Slice<CanvasSlice> = (set, get) => ({
  engine: null,
  tool: 'select',
  styles: parseStyles(readText(STYLES_KEY)),
  recentColors: parseRecentColors(readText(RECENT_COLORS_KEY)),
  zoom: 1,
  doc: {
    canUndo: false,
    canRedo: false,
    isEmpty: true,
    selectionCount: 0,
    selectionStyle: null,
    selectionGrouped: false,
    selectionLocked: false,
    selectionPrivate: null,
    hasLocked: false,
    hasCopiedStyle: false,
    selectionHasLink: false,
    selectionLink: null,
  },
  editing: null,
  contextMenu: null,
  setEngine: (engine) => set({ engine }),
  setTool: (tool) => set({ tool }),
  setToolStyle: (tool, patch) => {
    const styles = mergeToolStyle(get().styles, tool, patch);
    writeJSON(STYLES_KEY, styles);
    set({ styles });
  },
  addRecentColor: (color) => {
    const lower = color.toLowerCase() as HexColor;
    const recentColors = [lower, ...get().recentColors.filter((c) => c !== lower)].slice(
      0,
      RECENT_COLORS_LIMIT,
    );
    writeJSON(RECENT_COLORS_KEY, recentColors);
    set({ recentColors });
  },
  setZoom: (zoom) => {
    if (get().zoom !== zoom) set({ zoom });
  },
  setDoc: (doc) => set({ doc }),
  setEditing: (editing) => set({ editing }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
});
