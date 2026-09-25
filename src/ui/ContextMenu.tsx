import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuRequest } from '../engine/engine';
import { useUI } from '../store/ui';
import { copySelection, cutSelection, pasteFromClipboard } from './clipboard';
import { t } from '../i18n';

interface Item {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

type Entry = Item | 'divider';

/**
 * Right-click menu: on an element it offers copy, group, layers, flip, lock… and on an
 * empty spot, paste, select all or unlock.
 */
export function ContextMenu() {
  const request = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  if (!request) return null;
  return <Menu request={request} onClose={close} />;
}

function Menu({ request, onClose }: { request: ContextMenuRequest; onClose: () => void }) {
  useUI((s) => s.settings.language);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: request.x, top: request.y });
  const engine = useUI((s) => s.engine);
  const doc = useUI((s) => s.doc);
  const showToast = useUI((s) => s.showToast);

  // Keep it inside the window.
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
      // Esc only closes the menu (it doesn't release the selection or put the floating
      // diary away).
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

  const { contextMenu: m, commands: c } = t();
  const entries: Entry[] = request.onElement
    ? [
        { label: m.cut, shortcut: 'Ctrl+X', run: () => void cutSelection() },
        { label: m.copy, shortcut: 'Ctrl+C', run: () => void copySelection() },
        { label: m.paste, shortcut: 'Ctrl+V', run: () => void pasteFromClipboard() },
        'divider',
        {
          label: m.copyPng,
          shortcut: 'Shift+Alt+C',
          run: async () => {
            const ok = await engine.copySelectionAsPng();
            showToast(ok ? c.imageCopied : c.imageCopyFailed);
          },
        },
        'divider',
        { label: m.copyStyle, shortcut: 'Ctrl+Alt+C', run: () => engine.copyStyle() },
        {
          label: m.pasteStyle,
          shortcut: 'Ctrl+Alt+V',
          disabled: !doc.hasCopiedStyle,
          run: () => engine.pasteStyle(),
        },
        'divider',
        {
          label: c.group,
          shortcut: 'Ctrl+G',
          disabled: doc.selectionCount < 2,
          run: () => engine.groupSelection(),
        },
        {
          label: c.ungroup,
          shortcut: 'Ctrl+Shift+G',
          disabled: !doc.selectionGrouped,
          run: () => engine.ungroupSelection(),
        },
        'divider',
        {
          label: c.front,
          shortcut: 'Ctrl+Shift+↑',
          run: () => engine.arrangeSelection('front'),
        },
        {
          label: m.forward,
          shortcut: 'Ctrl+↑',
          run: () => engine.arrangeSelection('forward'),
        },
        {
          label: m.backward,
          shortcut: 'Ctrl+↓',
          run: () => engine.arrangeSelection('backward'),
        },
        {
          label: c.back,
          shortcut: 'Ctrl+Shift+↓',
          run: () => engine.arrangeSelection('back'),
        },
        'divider',
        {
          label: c.flipH,
          shortcut: 'Shift+H',
          run: () => engine.flipSelection('horizontal'),
        },
        {
          label: c.flipV,
          shortcut: 'Shift+V',
          run: () => engine.flipSelection('vertical'),
        },
        'divider',
        {
          label: doc.selectionHasLink ? c.changeLink : c.addLink,
          run: () => useUI.getState().setLinkDialogOpen(true),
        },
        ...(doc.selectionHasLink
          ? [{ label: c.unlink, run: () => engine.setSelectionLink(null) }]
          : []),
        'divider',
        { label: c.duplicate, shortcut: 'Ctrl+D', run: () => engine.duplicateSelection() },
        {
          label: doc.selectionLocked ? c.unlock : c.lock,
          shortcut: 'Ctrl+Shift+L',
          run: () => engine.toggleLockSelection(),
        },
        'divider',
        {
          label: m.delete,
          shortcut: t().keys.delete,
          danger: true,
          disabled: doc.selectionLocked,
          run: () => engine.deleteSelection(),
        },
      ]
    : [
        { label: m.paste, shortcut: 'Ctrl+V', run: () => void pasteFromClipboard() },
        'divider',
        {
          label: c.selectAll,
          shortcut: 'Ctrl+A',
          disabled: doc.isEmpty,
          run: () => {
            engine.selectAll();
            useUI.getState().setTool('select');
          },
        },
        { label: c.fit, shortcut: 'Shift+1', run: () => engine.zoomToFit() },
        {
          label: c.unlockAll,
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
