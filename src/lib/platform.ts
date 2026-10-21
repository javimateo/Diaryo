/** Is it the desktop app (Tauri), not the web app? Any layer may ask (desktop/tauri.ts too). */
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
