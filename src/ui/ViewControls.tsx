import { LocateFixed, Pin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pinDeskView } from '../desktop/bridge';
import { readDeskView, sameView } from '../desktop/saved';
import type { DeskView } from '../engine/engine';
import { useUI } from '../store/ui';
import { useT } from './useT';

/**
 * In the floating diary: pin the view (the diary will open like that and the desktop desk
 * will use it) and, if it was moved, go back to it.
 */
export function ViewControls() {
  const t = useT();
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
    pinDeskView();
    setPinned(view);
  };

  return (
    <div className="view-controls floating" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="icon-btn"
        data-active={atPinned || undefined}
        aria-label={atPinned ? t.view.pinned : t.view.pin}
        data-tip={atPinned ? t.view.pinnedTip : t.view.pinTip}
        data-tip-side="top"
        onClick={pin}
      >
        <Pin size={16} strokeWidth={2} />
      </button>
      {pinned && !atPinned && (
        <button
          type="button"
          className="icon-btn"
          aria-label={t.view.back}
          data-tip={t.view.back}
          data-tip-side="top"
          onClick={() => engine.animateToView(readDeskView() ?? pinned)}
        >
          <LocateFixed size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
