import type { Theme } from '../store/ui';

/** The canvas colors, taken from the theme's CSS variables. */
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
