import { RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { isDesktop } from '../desktop/tauri';
import { tourClip, type TourStep as StepId } from '../diary/tourScenes';
import { todayKey } from '../lib/dates';
import { useUI } from '../store/ui';
import { readCanvasTheme } from './canvasTheme';
import { ClipView } from './ClipView';
import { useT } from './useT';

/** Where on screen a step points (null: nowhere, the bubble goes in the middle). */
type Anchor = () => DOMRect | null;

const BUBBLE_WIDTH = 330;
const MARGIN = 16;

/** The element of the interface, if it is on screen. */
const element =
  (selector: string): Anchor =>
  () => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box && box.width > 0 ? box : null;
  };

/** The desk: a point beside the book, where there is room (or nothing). */
const desk: Anchor = () => {
  const book = useUI.getState().engine?.bookScreenRect();
  if (!book) return null;
  const x = book.x + book.width + 60;
  if (x > window.innerWidth - MARGIN) return null;
  return new DOMRect(x, book.y + book.height * 0.35, 1, 1);
};

function steps(): [StepId, Anchor][] {
  return [
    ['tools', element('.toolbar')],
    ['pages', element('.page-nav')],
    ['desk', desk],
    ['upcoming', element('.upcoming-btn')],
    ['search', element('.search-btn')],
    ['settings', element('[data-tour="settings"]')],
    // In the desktop app, the floating diary and the reminders.
    ...(isDesktop() ? [['floating', () => null] as [StepId, Anchor]] : []),
  ];
}

/** Steps whose scene is (also) what the tour lays over it, animated by CSS. */
const OVERLAID: StepId[] = ['search', 'floating'];

/**
 * The short tour of a new diary: a bubble beside each main part of the interface, with a
 * little scene of what it explains (see `tourScenes.ts`), "Next" and "Skip" (Esc). It can
 * be taken again from Settings → Help and Ctrl K.
 */
export function Tour() {
  const t = useT();
  const step = useUI((s) => s.tour);
  const setTour = useUI((s) => s.setTour);
  const theme = useUI((s) => s.theme);
  const style = useUI((s) => s.bookStyle);
  const language = useUI((s) => s.settings.language);
  /** Plays the scene again. */
  const [run, setRun] = useState(0);
  // Measured again when the window changes.
  const [, setSize] = useState(0);

  useEffect(() => {
    if (step === null) return;
    const onResize = () => setSize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [step]);

  const all = steps();
  const total = all.length;
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTour(null);
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        setTour(step + 1 < total ? step + 1 : null);
      } else if (e.key === 'ArrowLeft' && step > 0) setTour(step - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, total, setTour]);

  // The same clip while the step is the same (otherwise it would play again).
  const clip = useMemo(() => {
    const id = step === null ? undefined : steps()[step]?.[0];
    const context = { texts: t.tour.scenes, style, labels: t.book, language, today: todayKey() };
    return id ? tourClip(id, context) : null;
  }, [step, t, style, language]);
  const canvasTheme = useMemo(() => readCanvasTheme(theme), [theme]);

  if (step === null || step >= total || !clip) return null;
  const [id, anchor] = all[step];
  const replay = clip.duration > 0 || OVERLAID.includes(id);
  const box = anchor();
  const texts = t.tour.steps[id];
  const last = step === total - 1;

  let place: CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  let arrow: CSSProperties | null = null;
  if (box) {
    const center = box.x + box.width / 2;
    const left = Math.min(Math.max(center - 48, MARGIN), window.innerWidth - BUBBLE_WIDTH - MARGIN);
    // Below what it points at, or above it if it is at the bottom of the window.
    const below = box.y + box.height / 2 < window.innerHeight / 2;
    place = below
      ? { left, top: box.y + box.height + 14 }
      : { left, bottom: window.innerHeight - box.y + 14 };
    const x = Math.min(Math.max(center - left, 20), BUBBLE_WIDTH - 20);
    arrow = below ? { left: x, top: -7 } : { left: x, bottom: -7 };
  }

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      {box && box.width > 1 && (
        <div
          className="tour-ring"
          style={{
            left: box.x - 5,
            top: box.y - 5,
            width: box.width + 10,
            height: box.height + 10,
          }}
        />
      )}
      <div className="tour-bubble" style={{ ...place, width: BUBBLE_WIDTH }}>
        {arrow && <span className="tour-arrow" style={arrow} aria-hidden />}
        <ClipView
          className={`tour-scene tour-scene-${id}`}
          clip={clip}
          theme={canvasTheme}
          run={run}
        >
          {id === 'search' && <SearchScene key={run} />}
          {id === 'floating' && <FloatingScene key={run} />}
          {replay && (
            <button
              type="button"
              className="tour-replay"
              aria-label={t.tour.replay}
              title={t.tour.replay}
              onClick={() => setRun((n) => n + 1)}
            >
              <RotateCcw size={14} strokeWidth={2} />
            </button>
          )}
        </ClipView>
        <h2 id="tour-title">{texts.title}</h2>
        <p>{texts.text}</p>
        <div className="tour-row">
          <div className="tour-dots" aria-hidden>
            {all.map(([key], i) => (
              <i key={key} data-active={i === step || undefined} />
            ))}
          </div>
          <div className="tour-actions">
            {!last && (
              <button type="button" className="tour-skip" onClick={() => setTour(null)}>
                {t.tour.skip}
              </button>
            )}
            <button
              type="button"
              className="account-primary tour-next"
              autoFocus
              onClick={() => setTour(last ? null : step + 1)}
            >
              {last ? t.tour.done : t.tour.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The palette over the page: the search is written and what is found shows. */
function SearchScene() {
  const t = useT();
  const { query, results } = t.tour.scenes;
  return (
    <div className="tour-palette" aria-hidden>
      <div className="tour-palette-input">
        <Search size={12} strokeWidth={2} />
        <span>
          {Array.from(query).map((letter, i) => (
            <span key={i} style={{ animationDelay: `${500 + i * 160}ms` }}>
              {letter}
            </span>
          ))}
        </span>
        <kbd>Ctrl K</kbd>
      </div>
      {results.map(([where, what], i) => (
        <div
          key={what}
          className="tour-palette-row"
          data-first={i === 0 || undefined}
          style={{ animationDelay: `${600 + query.length * 160 + i * 120}ms` }}
        >
          <span>{what}</span>
          <em>{where}</em>
        </div>
      ))}
    </div>
  );
}

/** Another program behind and the keys that bring the diary over it. */
function FloatingScene() {
  return (
    <>
      <div className="tour-window" aria-hidden />
      <div className="tour-keys" aria-hidden>
        {['Ctrl', 'Alt', 'D'].map((key, i) => (
          <kbd key={key} style={{ animationDelay: `${200 + i * 180}ms` }}>
            {key}
          </kbd>
        ))}
      </div>
    </>
  );
}
