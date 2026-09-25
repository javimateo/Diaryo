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

/** Las opciones con dibujo del panel: puntas, rellenos, trazo y estilos de nota. */

/** Miniaturas de 18 × 18 para los botones de relleno y trazado. */
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

/** Puntas: [inicio, final, nombre, icono]. */
export const HEADS: [ArrowHead, ArrowHead, string, LucideIcon][] = [
  ['none', 'arrow', 'Punta al final', MoveRight],
  ['arrow', 'arrow', 'Puntas en los dos lados', MoveHorizontal],
  ['arrow', 'none', 'Punta al principio', MoveLeft],
  ['none', 'none', 'Sin puntas', Minus],
];

export const FILL_STYLES: [FillStyle, string, () => ReactNode][] = [
  [
    'solid',
    'Sólido',
    () => (
      <Preview>
        <rect x="2" y="2" width="14" height="14" rx="2" fill="currentColor" />
      </Preview>
    ),
  ],
  [
    'hachure',
    'Rayado',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8" />
      </Preview>
    ),
  ],
  [
    'cross-hatch',
    'Cuadriculado',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8M7 3l8 8M3 3l12 12M3 7l8 8" />
      </Preview>
    ),
  ],
  [
    'dots',
    'Puntos',
    () => (
      <Preview>
        <path d="M6 6h.01M12 6h.01M9 9h.01M6 12h.01M12 12h.01" strokeWidth="2.4" />
      </Preview>
    ),
  ],
  [
    'zigzag',
    'Zigzag',
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

export const ROUGHNESS: [Roughness, string, () => ReactNode][] = [
  [0, 'Limpio', () => <Line d="M2 13C7 5 15 5 20 13" />],
  [1, 'A mano', () => <Line d="M2 13c3-6 6-8 9-7s4 3 5 4 3 3 4 3" />],
  [2, 'Muy a mano', () => <Line d="M2 12c2-5 4-2 6-6s3 3 5 1 2-4 4-1 2 5 3 6" />],
];

export const VARIANT_ICONS: Record<NoteVariant, LucideIcon> = {
  plain: Square,
  strip: PanelTop,
  pin: Pin,
  tape: Bandage,
  clip: Paperclip,
  curl: StickyNote,
};
