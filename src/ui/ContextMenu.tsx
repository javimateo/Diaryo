import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuRequest } from '../engine/engine';
import { useUI } from '../store/ui';
import { copySelection, cutSelection, pasteFromClipboard } from './clipboard';

interface Item {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

type Entry = Item | 'divider';

/**
 * Menú del clic derecho: sobre un elemento ofrece copiar, agrupar, capas, voltear,
 * bloquear… y sobre un hueco, pegar, seleccionar todo o desbloquear.
 */
export function ContextMenu() {
  const request = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  if (!request) return null;
  return <Menu request={request} onClose={close} />;
}

function Menu({ request, onClose }: { request: ContextMenuRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: request.x, top: request.y });
  const engine = useUI((s) => s.engine);
  const doc = useUI((s) => s.doc);
  const showToast = useUI((s) => s.showToast);

  // Que no se salga de la ventana.
  useLayoutEffect(() => {
    const rect = ref.current!.getBoundingClientRect();
    setPosition({
      left: Math.min(request.x, window.innerWidth - rect.width - 8),
      top: Math.min(request.y, window.innerHeight - rect.height - 8),
    });
  }, [request]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc solo cierra el menú (no suelta la selección ni aparta el diario flotante).
      e.stopPropagation();
      onClose();
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('wheel', onBlur, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('wheel', onBlur);
    };
  }, [onClose]);

  if (!engine) return null;

  const entries: Entry[] = request.onElement
    ? [
        { label: 'Cortar', shortcut: 'Ctrl+X', run: () => void cutSelection() },
        { label: 'Copiar', shortcut: 'Ctrl+C', run: () => void copySelection() },
        { label: 'Pegar', shortcut: 'Ctrl+V', run: () => void pasteFromClipboard() },
        'divider',
        {
          label: 'Copiar como imagen PNG',
          shortcut: 'Shift+Alt+C',
          run: async () => {
            const ok = await engine.copySelectionAsPng();
            showToast(ok ? 'Imagen copiada' : 'No se ha podido copiar la imagen');
          },
        },
        'divider',
        { label: 'Copiar estilos', shortcut: 'Ctrl+Alt+C', run: () => engine.copyStyle() },
        {
          label: 'Pegar estilos',
          shortcut: 'Ctrl+Alt+V',
          disabled: !doc.hasCopiedStyle,
          run: () => engine.pasteStyle(),
        },
        'divider',
        {
          label: 'Agrupar',
          shortcut: 'Ctrl+G',
          disabled: doc.selectionCount < 2,
          run: () => engine.groupSelection(),
        },
        {
          label: 'Desagrupar',
          shortcut: 'Ctrl+Shift+G',
          disabled: !doc.selectionGrouped,
          run: () => engine.ungroupSelection(),
        },
        'divider',
        {
          label: 'Traer al frente',
          shortcut: 'Ctrl+Shift+↑',
          run: () => engine.arrangeSelection('front'),
        },
        {
          label: 'Traer adelante',
          shortcut: 'Ctrl+↑',
          run: () => engine.arrangeSelection('forward'),
        },
        {
          label: 'Enviar atrás',
          shortcut: 'Ctrl+↓',
          run: () => engine.arrangeSelection('backward'),
        },
        {
          label: 'Enviar al fondo',
          shortcut: 'Ctrl+Shift+↓',
          run: () => engine.arrangeSelection('back'),
        },
        'divider',
        {
          label: 'Voltear en horizontal',
          shortcut: 'Shift+H',
          run: () => engine.flipSelection('horizontal'),
        },
        {
          label: 'Voltear en vertical',
          shortcut: 'Shift+V',
          run: () => engine.flipSelection('vertical'),
        },
        'divider',
        {
          label: doc.selectionHasLink ? 'Cambiar el enlace…' : 'Enlazar con una página…',
          run: () => useUI.getState().setLinkDialogOpen(true),
        },
        ...(doc.selectionHasLink
          ? [{ label: 'Quitar el enlace', run: () => engine.setSelectionLink(null) }]
          : []),
        'divider',
        { label: 'Duplicar', shortcut: 'Ctrl+D', run: () => engine.duplicateSelection() },
        {
          label: doc.selectionLocked ? 'Desbloquear' : 'Bloquear',
          shortcut: 'Ctrl+Shift+L',
          run: () => engine.toggleLockSelection(),
        },
        'divider',
        {
          label: 'Borrar',
          shortcut: 'Supr',
          danger: true,
          disabled: doc.selectionLocked,
          run: () => engine.deleteSelection(),
        },
      ]
    : [
        { label: 'Pegar', shortcut: 'Ctrl+V', run: () => void pasteFromClipboard() },
        'divider',
        {
          label: 'Seleccionar todo',
          shortcut: 'Ctrl+A',
          disabled: doc.isEmpty,
          run: () => {
            engine.selectAll();
            useUI.getState().setTool('select');
          },
        },
        { label: 'Ver todo', shortcut: 'Shift+1', run: () => engine.zoomToFit() },
        {
          label: 'Desbloquear todo',
          disabled: !doc.hasLocked,
          run: () => {
            engine.unlockAll();
            useUI.getState().setTool('select');
          },
        },
      ];

  return createPortal(
    <div
      ref={ref}
      className="context-menu floating"
      role="menu"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'divider' ? (
          <div key={i} className="menu-divider" role="separator" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            className="menu-item"
            data-danger={entry.danger || undefined}
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.run();
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
