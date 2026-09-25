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
  /** Shortcut key (a letter, lowercase). */
  key: string;
  /** Optional number shortcut. */
  digit?: string;
  icon: LucideIcon;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'hand', key: 'h', icon: Hand },
    { id: 'select', key: 'v', digit: '1', icon: MousePointer2 },
    { id: 'lasso', key: 'l', digit: '2', icon: Lasso },
  ],
  [
    { id: 'pen', key: 'p', digit: '3', icon: Pencil },
    { id: 'marker', key: 'm', digit: '4', icon: Highlighter },
    { id: 'eraser', key: 'e', digit: '5', icon: Eraser },
  ],
  [
    { id: 'text', key: 't', digit: '6', icon: Type },
    { id: 'note', key: 'n', digit: '7', icon: StickyNote },
    { id: 'arrow', key: 'a', digit: '8', icon: MoveUpRight },
    { id: 'rect', key: 'r', digit: '9', icon: Square },
    { id: 'ellipse', key: 'o', digit: '0', icon: Circle },
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
