import { useCallback, useEffect, useRef } from 'react';
import { DeskLayerController } from '../../desktop/deskLayer';
import { isDesktop } from '../../desktop/tauri';
import { Engine } from '../../engine/engine';
import { useUI } from '../../store/ui';
import { readCanvasTheme } from '../canvasTheme';
import { TextEditor } from '../TextEditor';
import { MiniDiary } from './MiniDiary';

/**
 * The window of the desk on the Windows desktop (see `DeskLayerController`): the canvas
 * with what is on the desk, the text editor and the mini diary.
 */
export function DeskLayer() {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<DeskLayerController | null>(null);
  const updateAreas = useCallback(() => controllerRef.current?.sendAreas(), []);
  const engine = useUI((s) => s.engine);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-desk-layer', true);
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { deskLayer: true },
    );
    const controller = new DeskLayerController(
      instance,
      () => miniRef.current?.getBoundingClientRect() ?? null,
    );
    controllerRef.current = controller;
    useUI.getState().setEngine(instance);
    // Development only: access from the console for debugging.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });
    void controller.start();
    return () => {
      controller.stop();
      controllerRef.current = null;
      instance.destroy();
      useUI.getState().setEngine(null);
    };
  }, []);

  useEffect(() => {
    engine?.setTheme(readCanvasTheme(theme));
  }, [engine, theme]);

  return (
    <div className="app">
      <canvas ref={sceneRef} className="canvas" aria-hidden />
      <canvas ref={overlayRef} className="canvas" />
      <TextEditor />
      <MiniDiary ref={miniRef} onChange={updateAreas} desktop={isDesktop()} />
    </div>
  );
}
