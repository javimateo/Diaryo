import { useCallback, useEffect, useRef } from 'react';
import { DeskLayerController } from '../../desktop/deskLayer';
import { isDesktop } from '../../desktop/tauri';
import { Engine } from '../../engine/engine';
import { useUI } from '../../store/ui';
import { readCanvasTheme } from '../canvasTheme';
import { TextEditor } from '../TextEditor';
import { LockDialog } from '../LockDialog';
import { askToReveal, startPrivacyTimers } from '../privateActions';
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
  const lockDialog = useUI((s) => s.lockDialog);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-desk-layer', true);
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { deskLayer: true },
    );
    const controller = new DeskLayerController(instance, () =>
      [miniRef.current, document.querySelector('.vault-dialog')]
        .filter((el): el is Element => el !== null)
        .map((el) => el.getBoundingClientRect()),
    );
    // A hidden private note asks for the diary password right here (the diary may be put
    // away); the ones shown hide again by themselves, as in the diary.
    const stopReveal = instance.subscribeReveal((id) => askToReveal([id]));
    const stopTimers = startPrivacyTimers(instance);
    controllerRef.current = controller;
    useUI.getState().setEngine(instance);
    // Development only: access from the console for debugging.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });
    void controller.start();
    return () => {
      stopReveal();
      stopTimers();
      controller.stop();
      controllerRef.current = null;
      instance.destroy();
      useUI.getState().setEngine(null);
    };
  }, []);

  useEffect(() => {
    engine?.setTheme(readCanvasTheme(theme));
  }, [engine, theme]);

  // The dialog takes the mouse while it is open.
  useEffect(updateAreas, [updateAreas, lockDialog]);

  return (
    <div className="app">
      <canvas ref={sceneRef} className="canvas" aria-hidden />
      <canvas ref={overlayRef} className="canvas" />
      <TextEditor />
      <MiniDiary ref={miniRef} onChange={updateAreas} desktop={isDesktop()} />
      <LockDialog />
    </div>
  );
}
