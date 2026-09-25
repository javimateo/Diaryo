import { forwardRef, useEffect, useRef, useState, type PointerEvent } from 'react';
import { readToday, TODAY_KEY, type TodayCard } from '../../desktop/saved';
import { call, emit } from '../../desktop/tauri';
import { asRecord, readJSON, writeJSON } from '../../lib/saved';
import { useT } from '../useT';

const POSITION_KEY = 'diaryo:mini-diary';
/** Margin from the screen edges. */
const EDGE = 24;
/** How far the mouse must move for a click to become a drag. */
const DRAG = 4;

/** Where it is: distance to the right edge and to the top (so it stays at the top right). */
interface Place {
  right: number;
  top: number;
}

/** Where it was left (or, otherwise, at the top right). */
function readPlace(): Place {
  const { right, top } = asRecord(readJSON(POSITION_KEY));
  return typeof right === 'number' && typeof top === 'number'
    ? { right, top }
    : { right: EDGE, top: EDGE };
}

/** Opens the floating diary on today's page. */
async function openToday() {
  await emit('diaryo://go-today');
  await call('show_mode', { mode: 'widget' });
}

/**
 * The desktop mini diary: today's double page in small, with the covers around it. A
 * click opens the floating diary; dragging it moves it.
 */
export const MiniDiary = forwardRef<HTMLDivElement, { onChange: () => void; desktop: boolean }>(
  function MiniDiary({ onChange, desktop }, ref) {
    const t = useT();
    const [card, setCard] = useState<TodayCard | null>(readToday);
    const [place, setPlace] = useState<Place>(readPlace);
    const drag = useRef<{ x: number; y: number; from: Place; moved: boolean } | null>(null);

    useEffect(() => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === TODAY_KEY) setCard(readToday());
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Wherever it is (and when the image loads), it takes the mouse there.
    useEffect(onChange, [onChange, card, place]);

    if (!card) return null;

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, from: place, moved: false };
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG) return;
      d.moved = true;
      const box = e.currentTarget.getBoundingClientRect();
      setPlace({
        right: Math.min(Math.max(d.from.right - dx, 0), window.innerWidth - box.width),
        top: Math.min(Math.max(d.from.top + dy, 0), window.innerHeight - box.height),
      });
    };
    const onPointerUp = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.moved) writeJSON(POSITION_KEY, place);
      else if (desktop) void openToday();
    };

    const tasks = card.pending === 0 ? t.miniDiary.today : t.miniDiary.tasks(card.pending);

    return (
      <div
        ref={ref}
        className="mini-diary"
        style={{ right: place.right, top: place.top }}
        role="button"
        aria-label={t.miniDiary.openLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="mini-diary-book" style={{ background: card.cover }}>
          <img src={card.image} alt="" draggable={false} onLoad={onChange} />
        </div>
        <div className="mini-diary-meta">
          <span className="mini-diary-chip">{tasks}</span>
          <span className="mini-diary-chip">{t.miniDiary.open}</span>
        </div>
      </div>
    );
  },
);
