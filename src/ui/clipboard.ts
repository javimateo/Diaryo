import { t } from '../i18n';
import { useUI } from '../store/ui';

/**
 * Clipboard from buttons or menus (without a keyboard shortcut): the browser's async API
 * is used. With Ctrl+C/X/V the normal events are used (see useShortcuts), which don't ask
 * for permission.
 */

function ensureSelectionTool() {
  const { tool, setTool } = useUI.getState();
  if (tool !== 'select' && tool !== 'lasso') setTool('select');
}

export async function copySelection(): Promise<boolean> {
  const text = useUI.getState().engine?.copySelection();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    useUI.getState().showToast(t().toasts.copyFailed);
    return false;
  }
}

export async function cutSelection(): Promise<void> {
  if (await copySelection()) useUI.getState().engine?.deleteSelection();
}

export async function pasteFromClipboard(): Promise<void> {
  const { engine, showToast } = useUI.getState();
  if (!engine) return;
  try {
    for (const item of await navigator.clipboard.read()) {
      const imageType = item.types.find((type) => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        await engine.insertImageFiles([new File([blob], 'imagen', { type: imageType })]);
        return;
      }
      if (item.types.includes('text/plain')) {
        const text = await (await item.getType('text/plain')).text();
        if (engine.paste(text) || engine.insertText(text)) ensureSelectionTool();
        return;
      }
    }
  } catch {
    showToast(t().toasts.useCtrlV);
  }
}
