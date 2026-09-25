import { useUI } from '../store/ui';

/**
 * Portapapeles desde botones o menús (sin atajo de teclado): se usa la API
 * asíncrona del navegador. Con Ctrl+C/X/V se usan los eventos normales (ver
 * useShortcuts), que no piden permiso.
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
    useUI.getState().showToast('No se ha podido copiar');
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
    showToast('Usa Ctrl+V para pegar');
  }
}
