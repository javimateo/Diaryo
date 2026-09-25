import {
  Bandage,
  Minus,
  MoveHorizontal,
  MoveLeft,
  MoveRight,
  PanelTop,
  Paperclip,
  Pin,
  Square,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { type ArrowHead, type FillStyle, type Roughness } from '../../engine/elements';
import { type NoteVariant } from '../../engine/notes';

/** The panel options that come with a drawing: arrowheads, fills, stroke and note styles. */

/** 18 × 18 thumbnails for the fill and stroke buttons. */
function Preview({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="2" y="2" width="14" height="14" rx="2" />
      {children}
    </svg>
  );
}

/** Arrowheads: [start, end, which (for its name), icon]. */
export const HEADS: [ArrowHead, ArrowHead, HeadsKind, LucideIcon][] = [
  ['none', 'arrow', 'end', MoveRight],
  ['arrow', 'arrow', 'both', MoveHorizontal],
  ['arrow', 'none', 'start', MoveLeft],
  ['none', 'none', 'none', Minus],
];

export type HeadsKind = 'end' | 'both' | 'start' | 'none';

export const FILL_STYLES: [FillStyle, () => ReactNode][] = [
  [
    'solid',
    () => (
      <Preview>
        <rect x="2" y="2" width="14" height="14" rx="2" fill="currentColor" />
      </Preview>
    ),
  ],
  [
    'hachure',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8" />
      </Preview>
    ),
  ],
  [
    'cross-hatch',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8M7 3l8 8M3 3l12 12M3 7l8 8" />
      </Preview>
    ),
  ],
  [
    'dots',
    () => (
      <Preview>
        <path d="M6 6h.01M12 6h.01M9 9h.01M6 12h.01M12 12h.01" strokeWidth="2.4" />
      </Preview>
    ),
  ],
  [
    'zigzag',
    () => (
      <Preview>
        <path d="M3 7l3 3 3-3 3 3 3-3M3 11l3 3 3-3 3 3 3-3" />
      </Preview>
    ),
  ],
];

function Line({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 22 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  );
}

export const ROUGHNESS: [Roughness, () => ReactNode][] = [
  [0, () => <Line d="M2 13C7 5 15 5 20 13" />],
  [1, () => <Line d="M2 13c3-6 6-8 9-7s4 3 5 4 3 3 4 3" />],
  [2, () => <Line d="M2 12c2-5 4-2 6-6s3 3 5 1 2-4 4-1 2 5 3 6" />],
];

export const VARIANT_ICONS: Record<NoteVariant, LucideIcon> = {
  plain: Square,
  strip: PanelTop,
  pin: Pin,
  tape: Bandage,
  clip: Paperclip,
  curl: StickyNote,
};
