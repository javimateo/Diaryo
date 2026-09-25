import { useEffect } from 'react';
import { isEditableTarget } from '../engine/dom';
import { stepSize } from '../engine/elements';
import { hideDesktop } from '../desktop/bridge';
import { useUI } from '../store/ui';
import { addPage, goToToday, toggleBookmark, turnPage } from './diaryActions';
import { findToolForKey } from './toolDefs';

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Tras seleccionar algo desde el teclado, pasar a una herramienta que muestre la selección. */
function ensureSelectionTool() {
  const { tool, setTool } = useUI.getState();
  if (tool !== 'select' && tool !== 'lasso') setTool('select');
}

/** Atajos globales de teclado (al estilo Excalidraw). */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Mientras se escribe, las teclas son texto (aunque el foco aún no haya llegado).
      if (isEditableTarget(e.target) || useUI.getState().editing) return;
      // Con los ajustes abiertos, solo Ctrl+, (para cerrarlos); Esc lo atienden ellos.
      if (useUI.getState().settingsOpen) {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault();
          useUI.getState().setSettingsOpen(false);
        }
        return;
      }
      const { engine, helpOpen, setHelpOpen, setTool, toggleTheme, showToast } = useUI.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Alt: copiar y pegar estilos.
      if (mod && e.altKey && !e.shiftKey) {
        if (e.code === 'KeyC' && engine?.copyStyle()) e.preventDefault();
        else if (e.code === 'KeyV' && engine?.pasteStyle()) e.preventDefault();
        return;
      }
      if (e.shiftKey && e.altKey && !mod && e.code === 'KeyC') {
        e.preventDefault();
        void engine?.copySelectionAsPng().then((ok) => ok && showToast('Imagen copiada'));
        return;
      }

      if (mod && !e.altKey) {
        const key = e.key.toLowerCase();
        const arrange = { ArrowUp: 'forward', ArrowDown: 'backward' } as const;
        if (key === 's') {
          // Se guarda solo; Ctrl+S solo lo confirma (y evita el "Guardar página" del navegador).
          void useUI.getState().diary?.flush();
          showToast('Todo está guardado · se guarda solo');
        } else if (key === 'z' && !e.shiftKey) engine?.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') engine?.redo();
        else if (e.code === 'KeyG') {
          if (e.shiftKey) engine?.ungroupSelection();
          else engine?.groupSelection();
        } else if (e.code === 'KeyL' && e.shiftKey) engine?.toggleLockSelection();
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          if (e.shiftKey) engine?.arrangeSelection(e.key === 'ArrowUp' ? 'front' : 'back');
          else engine?.arrangeSelection(arrange[e.key]);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          if (!e.repeat) void turnPage(e.key === 'ArrowRight' ? 1 : -1);
        } else if (e.key === 'Home') goToToday();
        else if (e.key === ',') useUI.getState().setSettingsOpen(true);
        else if ((e.code === 'KeyK' || e.code === 'KeyF') && !e.shiftKey) {
          // Buscar y comandos (también sustituye al "Buscar" del navegador, que no ve el lienzo).
          const { paletteOpen, setPaletteOpen } = useUI.getState();
          setPaletteOpen(!paletteOpen);
        } else if (e.code === 'KeyB' && !e.shiftKey) {
          const { diaryOpen, setDiaryOpen } = useUI.getState();
          setDiaryOpen(!diaryOpen);
        } else if (key === 'a') {
          engine?.selectAll();
          ensureSelectionTool();
        } else if (key === 'd') {
          // También evita que el navegador abra "Añadir a marcadores".
          if (engine?.duplicateSelection()) ensureSelectionTool();
        }
        // Sustituyen al zoom del navegador.
        else if (e.key === '+' || e.key === '=') engine?.zoomIn();
        else if (e.key === '-') engine?.zoomOut();
        else if (e.key === '0') engine?.resetZoom();
        else return;
        e.preventDefault();
        return;
      }

      if (e.altKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (e.altKey && !e.shiftKey && !mod && e.code === 'KeyN') {
        e.preventDefault();
        addPage();
        return;
      }
      if (e.altKey && !e.shiftKey && !mod && e.code === 'KeyM') {
        e.preventDefault();
        toggleBookmark();
        return;
      }
      if (e.altKey || mod) return;

      if (e.key === 'Escape') {
        const { doc, diaryOpen, setDiaryOpen, desktop } = useUI.getState();
        if (helpOpen) setHelpOpen(false);
        else if (doc.selectionCount === 0 && diaryOpen) setDiaryOpen(false);
        // En el diario flotante, Esc lo aparta (como el atajo).
        else if (doc.selectionCount === 0 && desktop?.mode === 'widget') void hideDesktop();
        else engine?.clearSelection();
        return;
      }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        if (!e.repeat) void turnPage(e.key === 'PageDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (engine?.deleteSelection()) e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        if (engine?.editSelection()) e.preventDefault();
        return;
      }
      const arrow = ARROWS[e.key];
      if (arrow) {
        const step = e.shiftKey ? 10 : 1;
        if (engine?.nudgeSelection(arrow[0] * step, arrow[1] * step)) e.preventDefault();
        return;
      }
      if (e.key === '?') {
        setHelpOpen(!helpOpen);
        return;
      }
      // + / − cambian el grosor o el tamaño de letra (se puede mantener pulsado).
      if (e.key === '+' || e.key === '-') {
        const direction = e.key === '+' ? 1 : -1;
        const { tool: current, styles, setToolStyle, doc, zoom } = useUI.getState();
        const selection = doc.selectionStyle;
        if (current === 'pen' || current === 'marker' || current === 'text' || current === 'note') {
          e.preventDefault();
          const kind = current === 'note' ? 'text' : current;
          setToolStyle(current, { size: stepSize(kind, styles[current].size, direction) });
        } else if (selection?.sizeKind && selection.size !== null) {
          e.preventDefault();
          const size = stepSize(selection.sizeKind, selection.size * zoom, direction);
          engine?.restyleSelection({ size });
        }
        return;
      }
      if (e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV')) {
        if (engine?.flipSelection(e.code === 'KeyH' ? 'horizontal' : 'vertical'))
          e.preventDefault();
        return;
      }
      if (e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        const { mapOpen, setMapOpen } = useUI.getState();
        setMapOpen(!mapOpen);
        return;
      }
      if (e.shiftKey && e.code === 'Digit1') {
        engine?.zoomToFit();
        return;
      }
      if (e.shiftKey || e.repeat) return;

      const tool = findToolForKey(e);
      if (!tool) return;
      e.preventDefault();
      if (tool.ready) setTool(tool.id);
      else showToast(`${tool.label}: llegará muy pronto`);
    };

    // Copiar, cortar y pegar usan los eventos del portapapeles del navegador.
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const text = useUI.getState().engine?.copySelection();
      if (!text || !e.clipboardData) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    };

    const onCut = (e: ClipboardEvent) => {
      onCopy(e);
      if (e.defaultPrevented) useUI.getState().engine?.deleteSelection();
    };

    // Pegar: imágenes, lo copiado desde diaryo o texto normal (se convierte en un texto).
    const onPaste = (e: ClipboardEvent) => {
      const engine = useUI.getState().engine;
      if (isEditableTarget(e.target) || !engine) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((file) => file.type.startsWith('image/'))) {
        e.preventDefault();
        void engine.insertImageFiles(files);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && (engine.paste(text) || engine.insertText(text))) {
        e.preventDefault();
        ensureSelectionTool();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}
