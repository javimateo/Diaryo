export type ToolId =
  | 'hand'
  | 'select'
  | 'lasso'
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'text'
  | 'note'
  | 'arrow'
  | 'rect'
  | 'ellipse';

/** Cursor CSS de cada herramienta mientras no se está arrastrando. */
export const TOOL_CURSORS: Record<ToolId, string> = {
  hand: 'grab',
  select: 'default',
  lasso: 'crosshair',
  pen: 'crosshair',
  marker: 'crosshair',
  eraser: 'cell',
  text: 'text',
  note: 'copy',
  arrow: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
};
