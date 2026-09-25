import { LayoutGrid, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { useUI } from '../store/ui';

export function ZoomControls() {
  const zoom = useUI((s) => s.zoom);
  const engine = useUI((s) => s.engine);
  const percent = Math.round(zoom * 100);

  return (
    <div className="zoom-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Alejar"
        data-tip="Alejar — Ctrl −"
        data-tip-side="top"
        onClick={() => engine?.zoomOut()}
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="zoom-value"
        aria-label="Restablecer zoom al 100 %"
        data-tip="Volver al 100 % — Ctrl 0"
        data-tip-side="top"
        onClick={() => engine?.resetZoom()}
      >
        {percent}%
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Acercar"
        data-tip="Acercar — Ctrl +"
        data-tip-side="top"
        onClick={() => engine?.zoomIn()}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Mapa del diario"
        data-tip="Mapa del diario — Shift M"
        data-tip-side="top"
        onClick={() => useUI.getState().setMapOpen(true)}
      >
        <LayoutGrid size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function UndoControls() {
  const engine = useUI((s) => s.engine);
  const { canUndo, canRedo } = useUI((s) => s.doc);

  return (
    <div className="undo-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Deshacer"
        data-tip="Deshacer — Ctrl Z"
        data-tip-side="top"
        disabled={!canUndo}
        onClick={() => engine?.undo()}
      >
        <Undo2 size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Rehacer"
        data-tip="Rehacer — Ctrl Shift Z"
        data-tip-side="top"
        disabled={!canRedo}
        onClick={() => engine?.redo()}
      >
        <Redo2 size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
