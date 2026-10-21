import type { EngineTheme } from '@app/engine/engine';
import type { ThemeMode } from '@app/engine/palette';

/** The app's canvas colors (src/styles/tokens.css). */
export const THEMES: Record<ThemeMode, EngineTheme> = {
  light: {
    mode: 'light',
    background: '#e7e2d8',
    dots: '#c4bdb1',
    accent: '#b8573f',
    handleFill: '#ffffff',
  },
  dark: {
    mode: 'dark',
    background: '#131210',
    dots: '#34322e',
    accent: '#e3876c',
    handleFill: '#262522',
  },
};

/** The website's theme (light unless the visitor chose dark). */
export const siteTheme = (): ThemeMode =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
