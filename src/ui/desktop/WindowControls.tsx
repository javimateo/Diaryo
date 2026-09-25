import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUI } from '../../store/ui';
import { hideDesktop } from '../../desktop/bridge';
import { currentWindow } from '../../desktop/tauri';
import { useT } from '../useT';

/** Is it the desktop app in its window (not the floating diary)? */
function useWindowMode() {
  return useUI((s) => s.desktop?.mode === 'window');
}

/** Minimize, maximize and close (to the tray), styled like the app's buttons. */
export function WindowControls() {
  const t = useT();
  const windowMode = useWindowMode();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!windowMode) return;
    let stop: (() => void) | null = null;
    let stopped = false;
    void (async () => {
      const win = await currentWindow();
      const update = async () => setMaximized(await win.isMaximized());
      await update();
      const unlisten = await win.onResized(() => void update());
      if (stopped) unlisten();
      else stop = unlisten;
    })();
    return () => {
      stopped = true;
      stop?.();
    };
  }, [windowMode]);

  if (!windowMode) return null;

  return (
    <>
      <span className="top-actions-separator" aria-hidden />
      <button
        type="button"
        className="icon-btn"
        aria-label={t.window.minimize}
        onClick={() => void currentWindow().then((win) => win.minimize())}
      >
        <Minus size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={maximized ? t.window.restore : t.window.maximize}
        onClick={() => void currentWindow().then((win) => win.toggleMaximize())}
      >
        {maximized ? (
          <Copy size={15} strokeWidth={1.75} style={{ transform: 'scaleX(-1)' }} />
        ) : (
          <Square size={15} strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        className="icon-btn window-close"
        aria-label={t.window.close}
        data-tip={t.window.closeTip}
        data-tip-align="end"
        onClick={() => void hideDesktop()}
      >
        <X size={18} strokeWidth={1.75} />
      </button>
    </>
  );
}

/**
 * Where the window is dragged from: the strip at the top, behind the panels. Double-click
 * maximizes or restores it, like a title bar.
 */
export function WindowDragRegion() {
  const windowMode = useWindowMode();
  if (!windowMode) return null;
  return (
    <div
      className="window-drag-region"
      onMouseDown={(e) => {
        if (e.button === 0 && e.detail === 1)
          void currentWindow().then((win) => win.startDragging());
      }}
      onDoubleClick={() => void currentWindow().then((win) => win.toggleMaximize())}
    />
  );
}
