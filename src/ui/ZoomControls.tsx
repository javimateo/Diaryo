import { LayoutGrid, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { useUI } from '../store/ui';
import { useT } from './useT';

export function ZoomControls() {
  const t = useT();
  const zoom = useUI((s) => s.zoom);
  const engine = useUI((s) => s.engine);
  const percent = Math.round(zoom * 100);

  return (
    <div className="zoom-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.zoom.out}
        data-tip={`${t.zoom.out} — Ctrl −`}
        data-tip-side="top"
        onClick={() => engine?.zoomOut()}
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="zoom-value"
        aria-label={t.zoom.reset}
        data-tip={`${t.zoom.resetTip} — Ctrl 0`}
        data-tip-side="top"
        onClick={() => engine?.resetZoom()}
      >
        {percent}%
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.zoom.in}
        data-tip={`${t.zoom.in} — Ctrl +`}
        data-tip-side="top"
        onClick={() => engine?.zoomIn()}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.zoom.map}
        data-tip={`${t.zoom.map} — Shift M`}
        data-tip-side="top"
        onClick={() => useUI.getState().setMapOpen(true)}
      >
        <LayoutGrid size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function UndoControls() {
  const t = useT();
  const engine = useUI((s) => s.engine);
  const { canUndo, canRedo } = useUI((s) => s.doc);

  return (
    <div className="undo-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.zoom.undo}
        data-tip={`${t.zoom.undo} — Ctrl Z`}
        data-tip-side="top"
        disabled={!canUndo}
        onClick={() => engine?.undo()}
      >
        <Undo2 size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.zoom.redo}
        data-tip={`${t.zoom.redo} — Ctrl Shift Z`}
        data-tip-side="top"
        disabled={!canRedo}
        onClick={() => engine?.redo()}
      >
        <Redo2 size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
