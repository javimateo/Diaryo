import { forwardRef, useEffect, useRef, useState, type PointerEvent } from 'react';
import { call, readToday, TODAY_KEY, type TodayCard } from './desktop';

const POSITION_KEY = 'diaryo:mini-diary';
/** Margen con los bordes de la pantalla. */
const EDGE = 24;
/** Lo que hay que mover el ratón para que un clic pase a ser arrastrar. */
const DRAG = 4;

/** Dónde está: distancia al borde derecho y al de arriba (así se queda arriba a la derecha). */
interface Place {
  right: number;
  top: number;
}

function readPlace(): Place {
  try {
    const place = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Place | null;
    if (place && Number.isFinite(place.right) && Number.isFinite(place.top)) return place;
  } catch {
    // Sin almacenamiento, en su sitio de siempre.
  }
  return { right: EDGE, top: EDGE };
}

function savePlace(place: Place) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(place));
  } catch {
    // Se queda donde está hasta que se cierre.
  }
}

/** Abre el diario flotante en la página de hoy. */
async function openToday() {
  const { emit } = await import('@tauri-apps/api/event');
  await emit('diaryo://go-today');
  await call('show_mode', { mode: 'widget' });
}

/**
 * El mini diario del escritorio: la doble página de hoy en pequeño, con las tapas
 * alrededor. Un clic abre el diario flotante; arrastrándolo se cambia de sitio.
 */
export const MiniDiary = forwardRef<HTMLDivElement, { onChange: () => void; desktop: boolean }>(
  function MiniDiary({ onChange, desktop }, ref) {
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

    // Donde esté (y al cargar la imagen), ahí recibe el ratón.
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
      if (d.moved) savePlace(place);
      else if (desktop) void openToday();
    };

    const tasks =
      card.pending === 0
        ? 'Hoy'
        : `Hoy · ${card.pending} ${card.pending === 1 ? 'tarea' : 'tareas'}`;

    return (
      <div
        ref={ref}
        className="mini-diary"
        style={{ right: place.right, top: place.top }}
        role="button"
        aria-label="Abrir el diario en la página de hoy"
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
          <span className="mini-diary-chip">Abrir</span>
        </div>
      </div>
    );
  },
);
