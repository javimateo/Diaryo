import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Small floating window next to a button (to its right). It closes on a click outside or
 * with Escape. It goes in a portal so the scrolling panel doesn't clip it.
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
    // Inside the side panel, it opens to its right so it doesn't cover it.
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
