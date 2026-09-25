import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUI } from '../../store/ui';
import { hideDesktop } from '../../desktop/bridge';
import { currentWindow } from '../../desktop/tauri';

/** ¿Es la app de escritorio en su ventana (no el diario flotante)? */
function useWindowMode() {
  return useUI((s) => s.desktop?.mode === 'window');
}

/** Minimizar, maximizar y cerrar (a la bandeja), con el estilo de los botones de la app. */
export function WindowControls() {
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
        aria-label="Minimizar"
        onClick={() => void currentWindow().then((win) => win.minimize())}
      >
        <Minus size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
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
        aria-label="Cerrar (diaryo sigue en la bandeja)"
        data-tip="Cerrar — diaryo sigue junto al reloj"
        data-tip-align="end"
        onClick={() => void hideDesktop()}
      >
        <X size={18} strokeWidth={1.75} />
      </button>
    </>
  );
}

/**
 * Por dónde se arrastra la ventana: la franja de arriba, detrás de los paneles. Doble
 * clic la maximiza o la restaura, como una barra de título.
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
