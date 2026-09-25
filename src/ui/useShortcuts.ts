import { useEffect } from 'react';
import { isEditableTarget } from '../engine/dom';
import { stepSize } from '../engine/elements';
import { hideDesktop } from '../desktop/bridge';
import { useUI } from '../store/ui';
import { addPage, goToToday, toggleBookmark, turnPage } from './diaryActions';
import { findToolForKey } from './toolDefs';
import { t } from '../i18n';

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** After selecting something from the keyboard, switch to a tool that shows the selection. */
function ensureSelectionTool() {
  const { tool, setTool } = useUI.getState();
  if (tool !== 'select' && tool !== 'lasso') setTool('select');
}

/** Global keyboard shortcuts (Excalidraw style). */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // While writing, keys are text (even if the focus hasn't arrived yet).
      if (isEditableTarget(e.target) || useUI.getState().editing) return;
      // With the settings open, only Ctrl+, (to close them); they handle Esc themselves.
      if (useUI.getState().settingsOpen) {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault();
          useUI.getState().setSettingsOpen(false);
        }
        return;
      }
      const { engine, helpOpen, setHelpOpen, setTool, toggleTheme, showToast } = useUI.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Alt: copy and paste styles.
      if (mod && e.altKey && !e.shiftKey) {
        if (e.code === 'KeyC' && engine?.copyStyle()) e.preventDefault();
        else if (e.code === 'KeyV' && engine?.pasteStyle()) e.preventDefault();
        return;
      }
      if (e.shiftKey && e.altKey && !mod && e.code === 'KeyC') {
        e.preventDefault();
        void engine?.copySelectionAsPng().then((ok) => ok && showToast(t().commands.imageCopied));
        return;
      }

      if (mod && !e.altKey) {
        const key = e.key.toLowerCase();
        const arrange = { ArrowUp: 'forward', ArrowDown: 'backward' } as const;
        if (key === 's') {
          // It saves itself; Ctrl+S only confirms it (and avoids the browser's "Save
          // page").
          void useUI.getState().diary?.flush();
          showToast(t().toasts.allSaved);
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
          // Search and commands (it also replaces the browser's "Find", which can't see
          // the canvas).
          const { paletteOpen, setPaletteOpen } = useUI.getState();
          setPaletteOpen(!paletteOpen);
        } else if (e.code === 'KeyB' && !e.shiftKey) {
          const { diaryOpen, setDiaryOpen } = useUI.getState();
          setDiaryOpen(!diaryOpen);
        } else if (key === 'a') {
          engine?.selectAll();
          ensureSelectionTool();
        } else if (key === 'd') {
          // It also keeps the browser from opening "Add bookmark".
          if (engine?.duplicateSelection()) ensureSelectionTool();
        }
        // They replace the browser's zoom.
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
        // In the floating diary, Esc puts it away (like the shortcut).
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
      // + / − change the stroke width or the font size (can be held down).
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
      setTool(tool.id);
    };

    // Copy, cut and paste use the browser's clipboard events.
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

    // Paste: images, what was copied from diaryo or plain text (it becomes a text).
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
