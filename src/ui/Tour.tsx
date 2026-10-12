import { useEffect, useState, type CSSProperties } from 'react';
import { isDesktop } from '../desktop/tauri';
import type { Messages } from '../i18n';
import { useUI } from '../store/ui';
import { useT } from './useT';

type StepId = keyof Messages['tour']['steps'];

/** Where on screen a step points (null: nowhere, the bubble goes in the middle). */
type Anchor = () => DOMRect | null;

const BUBBLE_WIDTH = 300;
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

/**
 * The short tour of a new diary: a bubble beside each main part of the interface, with
 * "Next" and "Skip" (Esc). It can be taken again from Settings → Help and Ctrl K.
 */
export function Tour() {
  const t = useT();
  const step = useUI((s) => s.tour);
  const setTour = useUI((s) => s.setTour);
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

  if (step === null || step >= total) return null;
  const [id, anchor] = all[step];
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
