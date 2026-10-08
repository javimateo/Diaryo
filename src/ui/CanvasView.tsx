import { useEffect, useRef } from 'react';
import { formatDayMonth } from '../i18n/dates';
import { Diary } from '../diary/diary';
import type { PageMeta } from '../diary/pages';
import { followLink } from './diaryActions';
import { DesktopBridge } from '../desktop/bridge';
import { isDesktop, notifyDeskSaved } from '../desktop/tauri';
import { askToReveal, startPrivacy } from './privateActions';
import { hideNotes } from '../cloud/lock';
import { Updater } from '../desktop/updates';
import { Engine } from '../engine/engine';
import { getDB } from '../storage/db';
import { useUI } from '../store/ui';
import { readCanvasTheme } from './canvasTheme';
import { t } from '../i18n';

/** Short name of each page for the link labels: title or "21 sept". */
function linkLabels(pages: PageMeta[]): Map<string, string> {
  const short = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
  return new Map(pages.map((p) => [p.id, short(p.title || formatDayMonth(p.date))]));
}

export function CanvasView() {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engine = useUI((s) => s.engine);
  const tool = useUI((s) => s.tool);
  const styles = useUI((s) => s.styles);
  const theme = useUI((s) => s.theme);
  const language = useUI((s) => s.settings.language);

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
    // In the desktop app, the floating diary lets the desktop show through.
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { transparent: desktop },
    );
    const unsubscribeCamera = instance.subscribe((camera) => setZoom(camera.zoom));
    const unsubscribeState = instance.subscribeState(setDoc);
    const unsubscribeEditing = instance.subscribeEditing(setEditing);
    // A hidden private note asks for the diary password (to see or edit it).
    const unsubscribeReveal = instance.subscribeReveal((id) => askToReveal([id]));
    // Its open padlock hides a private note that is shown.
    const unsubscribeHide = instance.subscribeHide((id) => void hideNotes([id]));
    instance.onToolRequest(setTool);
    instance.onContextMenu(openContextMenu);
    instance.onLinkOpen((pageId) => void followLink(pageId));
    setEngine(instance);
    // Open the diary (today's page) and, from then on, save every change.
    const diary = new Diary(getDB(), instance, {
      onState: (state) => {
        setDiaryState(state);
        instance.setLinkLabels(linkLabels(state.pages), t().props.deletedPage);
      },
      onStatus: setSaveStatus,
      bookStyle: () => useUI.getState().bookStyle,
      turnSpeed: () => useUI.getState().settings.turnSpeed,
      // The desktop layer shows the same desk: it is told so it catches up.
      onDeskSaved: desktop ? notifyDeskSaved : undefined,
    });
    setDiary(diary);
    const stopPrivacy = startPrivacy(diary);
    // In the desktop app, as soon as today's page is there it connects with it.
    const bridge = desktop ? new DesktopBridge(instance, diary) : null;
    useUI.getState().setDesktopBridge(bridge);
    // New versions, from the GitHub releases.
    const updater = desktop
      ? new Updater({
          auto: () => useUI.getState().settings.autoUpdate,
          onAvailable: (version, install) =>
            useUI.getState().showToast(t().desktop.updateAvailable(version), {
              label: t().desktop.updateNow,
              run: install,
            }),
          beforeInstall: async () => {
            await diary.flush();
            await bridge?.backup();
          },
        })
      : null;
    updater?.start();
    if (bridge) void diary.start().then(() => bridge.start());
    else void diary.start();
    // Development only: access from the console for debugging and measuring.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });
    return () => {
      updater?.stop();
      bridge?.stop();
      useUI.getState().setDesktopBridge(null);
      unsubscribeCamera();
      unsubscribeState();
      unsubscribeEditing();
      unsubscribeReveal();
      unsubscribeHide();
      stopPrivacy();
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

  // When the language changes, what is written on the book (the date, "hoy", the labels)
  // and the link labels.
  useEffect(() => {
    const { diary, diaryState } = useUI.getState();
    diary?.refreshBook();
    engine?.setLinkLabels(linkLabels(diaryState.pages), t().props.deletedPage);
  }, [engine, language]);

  return (
    <>
      <canvas ref={sceneRef} className="canvas" aria-hidden />
      <canvas ref={overlayRef} className="canvas" />
    </>
  );
}
