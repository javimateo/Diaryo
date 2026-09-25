import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Palette,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
  formatDay,
  formatMonth,
  formatShortDay,
  monthGrid,
  parseDay,
  todayKey,
  weekdayInitials,
  type DayKey,
} from '../lib/dates';
import type { PageMeta } from '../diary/pages';
import { useUI } from '../store/ui';
import { BOOKMARK_COLORS } from '../diary/diary';
import { BookStyleSection } from './BookStyleSection';
import { addPage, cycleBookmarkColor, deletePage, toggleBookmark } from './diaryActions';

/** Índice del diario: calendario para saltar a cualquier día y lista de páginas. */
export function DiaryPanel() {
  const open = useUI((s) => s.diaryOpen);
  const setOpen = useUI((s) => s.setDiaryOpen);
  const { pages, current } = useUI((s) => s.diaryState);
  const [styling, setStyling] = useState(false);
  if (!open || !current) return null;

  return (
    <aside
      className="diary-panel floating"
      aria-label="Índice del diario"
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <header className="diary-header">
        <h2>Diario</h2>
        <span className="diary-count">
          {pages.length === 1 ? '1 página' : `${pages.length} páginas`}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Aspecto del diario"
          aria-pressed={styling}
          data-active={styling || undefined}
          data-tip="Aspecto del diario"
          onClick={() => setStyling(!styling)}
        >
          <Palette size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar el índice"
          data-tip="Cerrar — Ctrl B"
          data-tip-align="end"
          onClick={() => setOpen(false)}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>
      {styling && <BookStyleSection />}
      <Calendar pages={pages} current={current} />
      <button type="button" className="new-page-btn" onClick={addPage}>
        <Plus size={16} strokeWidth={2} />
        Nueva página
        <kbd>Alt N</kbd>
      </button>
      <PageList pages={pages} current={current} />
    </aside>
  );
}

function Calendar({ pages, current }: { pages: PageMeta[]; current: PageMeta }) {
  const today = todayKey();
  const weekStart = useUI((s) => s.settings.weekStart);
  const [view, setView] = useState(() => monthOf(current.date));
  // Al cambiar de página, el calendario muestra su mes.
  const [shownFor, setShownFor] = useState(current.date);
  if (shownFor !== current.date) {
    setShownFor(current.date);
    setView(monthOf(current.date));
  }

  const withPages = new Set(pages.map((p) => p.date));
  const move = (delta: number) => {
    const date = new Date(view.year, view.month + delta, 1);
    setView({ year: date.getFullYear(), month: date.getMonth() });
  };

  return (
    <section className="calendar" aria-label="Calendario">
      <div className="calendar-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Mes anterior"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <span className="calendar-month">{formatMonth(view.year, view.month)}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Mes siguiente"
          onClick={() => move(1)}
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {weekdayInitials(weekStart).map((d, i) => (
          <span key={i} className="calendar-weekday" aria-hidden>
            {d}
          </span>
        ))}
        {monthGrid(view.year, view.month, weekStart)
          .flat()
          .map((day, i) =>
            day ? (
              <button
                key={day}
                type="button"
                className="calendar-day"
                aria-label={formatDay(day, today)}
                aria-current={day === current.date ? 'date' : undefined}
                data-today={day === today || undefined}
                data-pages={withPages.has(day) || undefined}
                onClick={() => void useUI.getState().diary?.goToDay(day)}
              >
                {parseDay(day).getDate()}
              </button>
            ) : (
              <span key={`empty-${i}`} />
            ),
          )}
      </div>
    </section>
  );
}

const monthOf = (day: DayKey) => {
  const date = parseDay(day);
  return { year: date.getFullYear(), month: date.getMonth() };
};

/** Páginas de la más reciente a la más antigua, agrupadas por mes. */
function PageList({ pages, current }: { pages: PageMeta[]; current: PageMeta }) {
  if (pages.length === 0) {
    return (
      <p className="page-list-empty">
        Aún no hay páginas. Lo que escribas o dibujes se guarda en la página de hoy.
      </p>
    );
  }
  const groups: { key: string; label: string; pages: PageMeta[] }[] = [];
  for (const page of [...pages].reverse()) {
    const key = page.date.slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const date = parseDay(page.date);
      group = { key, label: formatMonth(date.getFullYear(), date.getMonth()), pages: [] };
      groups.push(group);
    }
    group.pages.push(page);
  }
  return (
    <div className="page-list">
      {groups.map((group) => (
        <section key={group.key}>
          <h3>{group.label}</h3>
          <ul>
            {group.pages.map((page) => (
              <PageItem key={page.id} page={page} active={page.id === current.id} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PageItem({ page, active }: { page: PageMeta; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const cancelled = useRef(false);
  const diary = useUI((s) => s.diary);

  const finish = (title: string | null) => {
    setRenaming(false);
    if (title !== null && title.trim() !== page.title) void diary?.rename(page.id, title);
  };

  return (
    <li className="page-item" data-active={active || undefined}>
      <button
        type="button"
        className="page-item-main"
        aria-current={active ? 'page' : undefined}
        onClick={() => void diary?.goToPage(page.id)}
        onDoubleClick={() => setRenaming(true)}
      >
        <span className="page-thumb">
          {page.thumbnail && <img src={page.thumbnail} alt="" draggable={false} />}
        </span>
        <span className="page-item-text">
          <span className="page-item-day">{formatShortDay(page.date)}</span>
          {!renaming && (
            <span className="page-item-title" data-empty={!page.title || undefined}>
              {page.title || 'Sin título'}
            </span>
          )}
        </span>
      </button>
      {renaming && (
        <input
          className="page-rename"
          defaultValue={page.title}
          placeholder="Título de la página"
          aria-label="Título de la página"
          maxLength={80}
          autoFocus
          onFocus={(e) => {
            cancelled.current = false;
            e.currentTarget.select();
          }}
          onBlur={(e) => finish(cancelled.current ? null : e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') cancelled.current = true;
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      )}
      {page.bookmark && !renaming && (
        <button
          type="button"
          className="page-item-tab"
          style={{ background: page.bookmark }}
          aria-label="Cambiar el color de la pestaña"
          title="Color de la pestaña"
          onClick={() => cycleBookmarkColor(page.id, BOOKMARK_COLORS)}
        />
      )}
      {!renaming && (
        <span className="page-item-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={page.bookmark ? 'Quitar la pestaña' : 'Marcar como importante'}
            aria-pressed={!!page.bookmark}
            title={page.bookmark ? 'Quitar la pestaña' : 'Marcar como importante'}
            onClick={() => toggleBookmark(page.id)}
          >
            <Bookmark size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cambiar el título"
            title="Título"
            onClick={() => setRenaming(true)}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Borrar la página"
            title="Borrar"
            onClick={() => void deletePage(page.id)}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </span>
      )}
    </li>
  );
}
