import { LocateFixed, Pin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pinDeskView, readDeskView, sameView } from '../desktop/desktop';
import type { DeskView } from '../engine/engine';
import { useUI } from '../store/ui';

/**
 * En el diario flotante: fijar la vista (el diario se abrirá así y la mesa del escritorio
 * la usará) y, si se ha movido, volver a ella.
 */
export function ViewControls() {
  const engine = useUI((s) => s.engine);
  const widget = useUI((s) => s.desktop?.mode === 'widget');
  const [pinned, setPinned] = useState<DeskView | null>(readDeskView);
  const [atPinned, setAtPinned] = useState(false);

  useEffect(() => {
    if (!engine || !widget) return;
    return engine.subscribe(() => {
      const view = readDeskView();
      setAtPinned(!!view && sameView(engine.view(), view));
    });
  }, [engine, widget, pinned]);

  if (!engine || !widget) return null;

  const pin = () => {
    const view = engine.view();
    pinDeskView(view);
    setPinned(view);
  };

  return (
    <div className="view-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        data-active={atPinned || undefined}
        aria-label={atPinned ? 'Vista fijada' : 'Fijar esta vista'}
        data-tip={
          atPinned
            ? 'Esta es la vista fijada'
            : 'Fijar esta vista: el diario se abrirá así y la mesa del escritorio la usará'
        }
        data-tip-side="top"
        onClick={pin}
      >
        <Pin size={16} strokeWidth={2} />
      </button>
      {pinned && !atPinned && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Volver a la vista fijada"
          data-tip="Volver a la vista fijada"
          data-tip-side="top"
          onClick={() => engine.animateToView(readDeskView() ?? pinned)}
        >
          <LocateFixed size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
