import { useCallback, useEffect, useRef } from 'react';
import { bookBoundsWith } from '../../engine/book';
import { isEditableTarget } from '../../engine/dom';
import { Engine } from '../../engine/engine';
import { Autosave, type SaveStatus } from '../../storage/autosave';
import { DESK_ID, DESK_INFO, getDB, listPages, loadPage } from '../../storage/db';
import { loadThemePreference, THEME_KEY, useUI } from '../../store/ui';
import { readCanvasTheme } from '../canvasTheme';
import { TextEditor } from '../TextEditor';
import {
  call,
  DESK_CHANGED,
  DESK_VIEW_KEY,
  isDesktop,
  notifyDeskSaved,
  readDeskView,
  WINDOW_ID,
} from '../../desktop/desktop';
import { MiniDiary } from './MiniDiary';

/**
 * La mesa en el escritorio de Windows: una ventana transparente detrás de las demás con
 * lo que hay en la mesa, en el mismo sitio que alrededor del diario flotante. Solo recibe
 * el ratón donde hay algo (la parte de escritorio lo decide con `hitAreas`); el resto de
 * clics llegan al escritorio. Se mueve, se escribe y se marcan tareas; para crear cosas
 * nuevas está el diario.
 */
export function DeskLayer() {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const sendAreasRef = useRef<() => void>(() => {});
  const updateAreas = useCallback(() => sendAreasRef.current(), []);
  const engine = useUI((s) => s.engine);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-desk-layer', true);
    const { setEngine, setEditing } = useUI.getState();
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { deskLayer: true },
    );
    instance.setTool('select');
    setEngine(instance);
    // Solo en desarrollo: acceso desde la consola para depurar.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });
    const db = getDB();
    // Fuera de la app de escritorio (en el navegador, para probarla) solo se pinta.
    const desktop = isDesktop();
    let stopped = false;

    // Dónde hay algo: ahí la ventana recibe el ratón (se manda una vez por frame, si cambia).
    let frame = 0;
    let sent = '';
    const sendAreas = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const areas = instance.hitAreas();
        const mini = miniRef.current?.getBoundingClientRect();
        if (mini) areas.push({ x: mini.x, y: mini.y, width: mini.width, height: mini.height });
        const key = JSON.stringify(areas);
        if (key === sent) return;
        sent = key;
        if (desktop) void call('set_desk_areas', { areas });
      });
    };
    sendAreasRef.current = sendAreas;
    const unsubscribeState = instance.subscribeState(sendAreas);
    const unsubscribeCamera = instance.subscribe(sendAreas);
    const unsubscribeEditing = instance.subscribeEditing((editing) => {
      setEditing(editing);
      sendAreas();
    });

    // La mesa en el mismo sitio que alrededor del diario flotante: con su última vista o,
    // si aún no se ha abierto, como la encuadra al abrirse (con pestañas, el libro deja
    // sitio para ellas).
    const frameBook = async () => {
      const view = readDeskView();
      if (view) {
        instance.lockView(view);
        return;
      }
      const pages = await listPages(db);
      if (!stopped) instance.lockCamera(bookBoundsWith(pages.some((p) => p.bookmark)));
    };

    let previous: SaveStatus = 'loading';
    const onStatus = (status: SaveStatus) => {
      if (desktop && status === 'saved' && previous === 'saving') void notifyDeskSaved();
      previous = status;
    };
    const autosave = new Autosave(db, instance, () => DESK_INFO, onStatus, false);

    // Lo cambiado en el diario (o al abrir una copia) se vuelve a leer.
    const reload = async () => {
      await autosave.flush();
      const desk = await loadPage(db, DESK_ID);
      if (stopped) return;
      for (const asset of desk.assets) instance.assets.add(asset.src, asset.id, false);
      instance.loadPage(desk.elements);
      await frameBook();
    };

    const cleanups: (() => void)[] = [];
    void (async () => {
      await frameBook();
      await autosave.start();
      if (!desktop) return;
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await Promise.all([
        listen<string>(DESK_CHANGED, (event) => {
          if (event.payload !== WINDOW_ID) void reload();
        }),
        // Cada vez que se enseña: el libro puede tener pestañas nuevas.
        listen('diaryo://desk-shown', () => void frameBook()),
      ]);
      if (stopped) unlisten.forEach((stop) => stop());
      else cleanups.push(...unlisten);
    })();

    // Al pasar a otra cosa (un clic en el escritorio, otra ventana), se suelta lo que había.
    const onBlur = () => {
      instance.finishEditing();
      instance.clearSelection();
    };
    // La cámara está fija: ni rueda, ni arrastrar con la rueda, ni espacio para moverse.
    const stopWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const stopMiddle = (e: PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      // Nada de lo del diario (herramientas, páginas, zoom): solo lo que se puede hacer aquí.
      e.stopPropagation();
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (mod && key === 'z' && !e.shiftKey) instance.undo();
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) instance.redo();
      else if (e.key === 'Delete' || e.key === 'Backspace') instance.deleteSelection();
      else if (e.key === 'Enter') instance.editSelection();
      else if (e.key === 'Escape') instance.clearSelection();
      else handled = e.key === ' ' || mod;
      if (handled) e.preventDefault();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) useUI.getState().setThemePreference(loadThemePreference());
      if (e.key === DESK_VIEW_KEY) void frameBook();
    };
    const preventMenu = (e: Event) => e.preventDefault();
    window.addEventListener('blur', onBlur);
    window.addEventListener('wheel', stopWheel, { capture: true, passive: false });
    window.addEventListener('pointerdown', stopMiddle, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('storage', onStorage);
    window.addEventListener('contextmenu', preventMenu);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((stop) => stop());
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('wheel', stopWheel, true);
      window.removeEventListener('pointerdown', stopMiddle, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('contextmenu', preventMenu);
      unsubscribeState();
      unsubscribeCamera();
      unsubscribeEditing();
      void autosave.stop();
      instance.destroy();
      setEngine(null);
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
