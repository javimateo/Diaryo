import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ventanita flotante junto a un botón (a su derecha). Se cierra al hacer clic fuera
 * o con Escape. Va en un portal para que no la recorte el panel con scroll.
 */
export function Popover(props: {
  anchor: HTMLElement | null;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { anchor, onClose, className, children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const own = ref.current.getBoundingClientRect();
    const margin = 8;
    // Dentro del panel lateral, se abre a su derecha para no taparlo.
    const side = (anchor.closest('.props-panel') ?? anchor).getBoundingClientRect();
    const left = Math.min(side.right + margin, window.innerWidth - own.width - margin);
    const top = Math.max(margin, Math.min(a.top - 8, window.innerHeight - own.height - margin));
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`popover floating ${className ?? ''}`}
      data-keep-editing
      data-scrollable
      style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
