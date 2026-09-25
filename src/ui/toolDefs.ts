import {
  Circle,
  Eraser,
  Hand,
  Highlighter,
  Lasso,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '../engine/tools';

export interface ToolDef {
  id: ToolId;
  label: string;
  /** Tecla de atajo (letra, en minúscula). */
  key: string;
  /** Atajo numérico opcional. */
  digit?: string;
  icon: LucideIcon;
  /** Las herramientas se van activando fase a fase. */
  ready: boolean;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'hand', label: 'Mano', key: 'h', icon: Hand, ready: true },
    { id: 'select', label: 'Seleccionar', key: 'v', digit: '1', icon: MousePointer2, ready: true },
    { id: 'lasso', label: 'Lazo', key: 'l', digit: '2', icon: Lasso, ready: true },
  ],
  [
    { id: 'pen', label: 'Lápiz', key: 'p', digit: '3', icon: Pencil, ready: true },
    { id: 'marker', label: 'Marcador', key: 'm', digit: '4', icon: Highlighter, ready: true },
    { id: 'eraser', label: 'Borrador', key: 'e', digit: '5', icon: Eraser, ready: true },
  ],
  [
    { id: 'text', label: 'Texto', key: 't', digit: '6', icon: Type, ready: true },
    { id: 'note', label: 'Nota', key: 'n', digit: '7', icon: StickyNote, ready: true },
    { id: 'arrow', label: 'Flecha', key: 'a', digit: '8', icon: MoveUpRight, ready: true },
    { id: 'rect', label: 'Rectángulo', key: 'r', digit: '9', icon: Square, ready: true },
    { id: 'ellipse', label: 'Elipse', key: 'o', digit: '0', icon: Circle, ready: true },
  ],
];

export const TOOLS = TOOL_GROUPS.flat();

export function findToolForKey(e: KeyboardEvent): ToolDef | undefined {
  const key = e.key.toLowerCase();
  return TOOLS.find(
    (t) =>
      t.key === key || (t.digit && (e.code === `Digit${t.digit}` || e.code === `Numpad${t.digit}`)),
  );
}
