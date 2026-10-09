import '@app/fonts';
import '@app/styles/text-editor.css';
import { Diary } from '@app/diary/diary';
import { bookBounds, DEFAULT_BOOK_STYLE } from '@app/engine/book';
import { DEFAULT_STYLES, type ToolStyles } from '@app/engine/elements';
import {
  Engine,
  type EditingState,
  type EngineState,
  type EngineTheme,
  type ScreenRect,
} from '@app/engine/engine';
import { fonts } from '@app/engine/fonts';
import type { ThemeMode } from '@app/engine/palette';
import type { ToolId } from '@app/engine/tools';
import { setLanguage, t as appTexts } from '@app/i18n';
import { DiaryoDB } from '@app/storage/db';
import { TextEditorView } from '@app/ui/TextEditorView';
import { TOOLS } from '@app/ui/toolDefs';
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { texts, type Lang } from '../i18n';
import { DESK_RIGHT, seedDiary, TODAY_PAGE } from './sample';
import './demo.css';

interface Props {
  lang: Lang;
}

/** Its own database, emptied on every visit: the demo keeps nothing. */
const DB_NAME = 'diaryo-demo';

/** The tools the demo offers (the app has a few more). */
const DEMO_TOOLS: ToolId[] = ['select', 'pen', 'marker', 'eraser', 'text', 'note', 'arrow', 'rect'];

/** The app's canvas colors (src/styles/tokens.css). */
const THEMES: Record<ThemeMode, EngineTheme> = {
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

/**
 * The app's tool sizes are in screen pixels and the demo shows the whole book small, so
 * they are about half: the same size relative to the page as in the app. Handwriting by
 * default: it suits a diary (and the demo's pages).
 */
const { pen, marker, text, note, shape, arrow } = DEFAULT_STYLES;
const STYLES: ToolStyles = {
  pen: { ...pen, size: 2.5 },
  marker: { ...marker, size: 11 },
  text: { ...text, font: 'caveat', size: 20 },
  note: { ...note, font: 'caveat', size: 15 },
  shape: { ...shape, size: 1.5, font: 'caveat', labelSize: 16 },
  arrow: { ...arrow, size: 1.5 },
};
const NOTE_SIZE = 120;

/** The website's theme (light unless the visitor chose dark). */
const siteTheme = (): ThemeMode =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * The hero's live demo: the app's engine and diary fill the hero (`[data-demo-host]`),
 * whose wood is the real desk, with the book where the still picture (`[data-demo-frame]`)
 * was and the text beside it. When it is ready it marks the hero `data-live`.
 */
export default function Demo({ lang }: Props) {
  const t = texts(lang).demo;
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<ToolId>('select');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [doc, setDoc] = useState<EngineState | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(siteTheme);
  /** Where the pages are on screen: the toolbar goes below them (and the covers). */
  const [frame, setFrame] = useState<ScreenRect | null>(null);
  /** The pointer is over the demo: its keys (undo, delete) are for it. */
  const hovered = useRef(false);

  // The engine and the demo diary.
  useEffect(() => {
    setLanguage(lang);
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { embedded: true, noteSize: NOTE_SIZE },
    );
    instance.setStyles(STYLES);
    instance.setTheme(THEMES[siteTheme()]);
    const cleanups = [instance.subscribeState(setDoc), instance.subscribeEditing(setEditing)];
    instance.onToolRequest(setTool);
    setEngine(instance);
    // Development only: access from the console, like the app.
    if (import.meta.env.DEV) Object.assign(window, { diaryo: instance });

    let diary: Diary | null = null;
    let cancelled = false;
    void (async () => {
      // The sample is measured with its font: it must be loaded first.
      await fonts.load('caveat');
      await new DiaryoDB(DB_NAME).delete();
      const db = new DiaryoDB(DB_NAME);
      await seedDiary(db, texts(lang));
      if (cancelled) return;
      diary = new Diary(db, instance, {
        onState: () => {},
        onStatus: () => {},
        bookStyle: () => DEFAULT_BOOK_STYLE,
      });
      await diary.start();
      // The diary reopens the last page seen today (yesterday, if it was turned back).
      await diary.goToPage(TODAY_PAGE, false);
      if (!cancelled) setReady(true);
    })().catch((error) => console.error("The demo couldn't start", error));

    return () => {
      cancelled = true;
      diary?.stop();
      cleanups.forEach((fn) => fn());
      instance.destroy();
      setEngine(null);
    };
  }, [lang]);

  useEffect(() => {
    engine?.setTool(tool);
  }, [engine, tool]);

  // Light or dark, like the website (its button changes `data-theme`).
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(siteTheme()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    engine?.setTheme(THEMES[theme]);
  }, [engine, theme]);

  // The book goes where the picture was (`[data-demo-frame]`), with a fixed view; again
  // whenever the hero changes size.
  useEffect(() => {
    const root = rootRef.current;
    const hero = root?.closest<HTMLElement>('[data-demo-host]');
    const slot = hero?.querySelector<HTMLElement>('[data-demo-frame]');
    if (!engine || !ready || !root || !hero || !slot) return;
    const place = () => {
      const box = root.getBoundingClientRect();
      const rect = slot.getBoundingClientRect();
      const area = {
        x: rect.left - box.left,
        y: rect.top - box.top,
        width: rect.width,
        height: rect.height,
      };
      // The book and, to its right, the desk notes.
      engine.frameInto({ ...bookBounds(), maxX: DESK_RIGHT }, area, 4);
      // (In window coordinates: the toolbar is placed inside the demo.)
      const book = engine.bookScreenRect();
      setFrame(book && { ...book, x: book.x - box.left, y: book.y - box.top });
    };
    hero.toggleAttribute('data-live', true);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(hero);
    return () => {
      observer.disconnect();
      hero.removeAttribute('data-live');
    };
  }, [engine, ready]);

  // Undo, redo and delete while the pointer is over the demo.
  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      if (!hovered.current || editing || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z' && !e.shiftKey) engine.undo();
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) engine.redo();
      else if (!((e.key === 'Delete' || e.key === 'Backspace') && engine.deleteSelection())) {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, editing]);

  const names = appTexts().tools.names;
  const tools = TOOLS.filter((def) => DEMO_TOOLS.includes(def.id));

  return (
    <div
      ref={rootRef}
      className="demo"
      data-ready={ready || undefined}
      onPointerEnter={() => (hovered.current = true)}
      onPointerLeave={() => (hovered.current = false)}
    >
      <canvas ref={sceneRef} className="demo-canvas" aria-hidden />
      <canvas ref={overlayRef} className="demo-canvas" aria-label={t.canvas} />
      <TextEditorView engine={engine} editing={editing} theme={theme} />
      {ready && frame && (
        <>
          <div
            className="demo-toolbar"
            role="toolbar"
            aria-label={t.tools}
            style={{ left: frame.x + frame.width / 2, top: frame.y + frame.height + 34 }}
          >
            <span className="demo-live">
              <span className="dot" aria-hidden />
              {t.live}
            </span>
            <span className="demo-sep" aria-hidden />
            {tools.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="demo-btn"
                aria-pressed={tool === id}
                aria-label={names[id]}
                title={names[id]}
                // Don't steal the focus from the text being written.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTool(id)}
              >
                <Icon size={18} strokeWidth={1.75} />
              </button>
            ))}
            <span className="demo-sep" aria-hidden />
            <button
              type="button"
              className="demo-btn"
              aria-label={t.undo}
              title={t.undo}
              disabled={!doc?.canUndo}
              onClick={() => engine?.undo()}
            >
              <Undo2 size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="demo-btn"
              aria-label={t.redo}
              title={t.redo}
              disabled={!doc?.canRedo}
              onClick={() => engine?.redo()}
            >
              <Redo2 size={18} strokeWidth={1.75} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
