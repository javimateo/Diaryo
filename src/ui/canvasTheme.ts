import type { Theme } from '../store/ui';

/** Los colores del lienzo, sacados de las variables de CSS del tema. */
export function readCanvasTheme(mode: Theme) {
  const css = getComputedStyle(document.documentElement);
  return {
    mode,
    background: css.getPropertyValue('--canvas-bg').trim(),
    dots: css.getPropertyValue('--canvas-dots').trim(),
    accent: css.getPropertyValue('--accent').trim(),
    handleFill: css.getPropertyValue('--surface').trim(),
  };
}
