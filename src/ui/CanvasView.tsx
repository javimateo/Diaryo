import { useEffect, useRef } from 'react';
import { formatDayMonth } from '../diary/dates';
import { Diary } from '../diary/diary';
import type { PageMeta } from '../diary/pages';
import { followLink } from './diaryActions';
import { isDesktop, notifyDeskSaved, startDesktop } from '../desktop/desktop';
import { Engine } from '../engine/engine';
import { getDB } from '../storage/actions';
import { useUI, type Theme } from '../store/ui';

/** Nombre corto de cada página para la etiqueta de los enlaces: título o "21 sept". */
function linkLabels(pages: PageMeta[]): Map<string, string> {
  const short = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
  return new Map(pages.map((p) => [p.id, short(p.title || formatDayMonth(p.date))]));
}

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

export function CanvasView() {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engine = useUI((s) => s.engine);
  const tool = useUI((s) => s.tool);
  const styles = useUI((s) => s.styles);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    const {
      setEngine,
      setZoom,
      setDoc,
      setEditing,
      setTool,
      openContextMenu,
      setSaveStatus,
      setDiary,
      setDiaryState,
    } = useUI.getState();
    const desktop = isDesktop();
    // En la app de escritorio, el diario flotante deja ver el escritorio.
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { transparent: desktop },
    );
    const unsubscribeCamera = instance.subscribe((camera) => setZoom(camera.zoom));
    const unsubscribeState = instance.subscribeState(setDoc);
    const unsubscribeEditing = instance.subscribeEditing(setEditing);
    instance.onToolRequest(setTool);
    instance.onContextMenu(openContextMenu);
    instance.onLinkOpen((pageId) => void followLink(pageId));
    setEngine(instance);
    // Abrir el diario (la página de hoy) y, desde ahí, guardar cada cambio.
    const diary = new Diary(getDB(), instance, {
      onState: (state) => {
        setDiaryState(state);
        instance.setLinkLabels(linkLabels(state.pages));
      },
      onStatus: setSaveStatus,
      bookStyle: () => useUI.getState().bookStyle,
      turnSpeed: () => useUI.getState().settings.turnSpeed,
      // La capa del escritorio enseña la misma mesa: se le avisa para que se ponga al día.
      onDeskSaved: desktop ? notifyDeskSaved : undefined,
    });
    setDiary(diary);
    let stopDesktop: (() => void) | null = null;
    let stopped = false;
    void diary.start().then(async () => {
      if (!desktop || stopped) return;
      const stop = await startDesktop(instance, diary);
      if (stopped) stop();
      else stopDesktop = stop;
    });
    // Solo en desarrollo: acceso desde la consola para depurar y medir.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });
    return () => {
      stopped = true;
      stopDesktop?.();
      unsubscribeCamera();
      unsubscribeState();
      unsubscribeEditing();
      diary.stop();
      setDiary(null);
      instance.destroy();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    engine?.setTool(tool);
  }, [engine, tool]);

  useEffect(() => {
    engine?.setStyles(styles);
  }, [engine, styles]);

  useEffect(() => {
    engine?.setTheme(readCanvasTheme(theme));
  }, [engine, theme]);

  return (
    <>
      <canvas ref={sceneRef} className="canvas" aria-hidden />
      <canvas ref={overlayRef} className="canvas" />
    </>
  );
}
