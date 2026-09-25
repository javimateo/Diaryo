import { Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDay, relativeDay, todayKey } from '../diary/dates';
import { positionInDay } from '../diary/pages';
import { useUI } from '../store/ui';
import { goToToday, toggleBookmark, turnPage } from './diaryActions';

/** Pie de página: la fecha (o el título) de la página abierta y flechas para pasar página. */
export function PageNav() {
  const { pages, current } = useUI((s) => s.diaryState);
  const diaryOpen = useUI((s) => s.diaryOpen);
  const setDiaryOpen = useUI((s) => s.setDiaryOpen);
  if (!current) return null;

  const today = todayKey();
  const day = formatDay(current.date, today);
  const relative = relativeDay(current.date, today);
  const position = positionInDay(pages, current);
  const details = [
    current.title ? (relative ?? day) : relative,
    position && `página ${position.index} de ${position.total}`,
  ].filter(Boolean);

  return (
    <div className="page-nav-wrap">
      {current.date !== today && (
        <button
          type="button"
          className="today-btn floating"
          data-tip="Ir a hoy — Ctrl Inicio"
          data-tip-side="top"
          onMouseDown={(e) => e.preventDefault()}
          onClick={goToToday}
        >
          Hoy
        </button>
      )}
      <nav
        className="page-nav floating"
        aria-label="Páginas"
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Página anterior"
          data-tip="Página anterior — Ctrl ←"
          data-tip-side="top"
          onClick={() => void turnPage(-1)}
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="page-label"
          aria-expanded={diaryOpen}
          data-tip={diaryOpen ? undefined : 'Índice del diario — Ctrl B'}
          data-tip-side="top"
          onClick={() => setDiaryOpen(!diaryOpen)}
        >
          <span className="page-title">{current.title || day}</span>
          {details.length > 0 && <span className="page-details">{details.join(' · ')}</span>}
        </button>
        <button
          type="button"
          className="icon-btn bookmark-btn"
          aria-label={current.bookmark ? 'Quitar la pestaña' : 'Marcar como importante'}
          aria-pressed={!!current.bookmark}
          data-tip={
            current.bookmark ? 'Quitar la pestaña — Alt M' : 'Marcar como importante — Alt M'
          }
          data-tip-side="top"
          onClick={() => toggleBookmark()}
        >
          <Bookmark
            size={17}
            strokeWidth={1.75}
            color={current.bookmark ?? 'currentColor'}
            fill={current.bookmark ?? 'none'}
          />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Página siguiente"
          data-tip="Página siguiente — Ctrl →"
          data-tip-side="top"
          data-tip-align="end"
          onClick={() => void turnPage(1)}
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>
      </nav>
    </div>
  );
}
