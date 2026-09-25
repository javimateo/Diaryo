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
import { monthGrid, parseDay, todayKey, type DayKey } from '../lib/dates';
import { formatDay, formatMonth, formatShortDay, weekdayInitials } from '../i18n/dates';
import type { PageMeta } from '../diary/pages';
import { useUI } from '../store/ui';
import { BOOKMARK_COLORS } from '../diary/diary';
import { BookStyleSection } from './BookStyleSection';
import { addPage, cycleBookmarkColor, deletePage, toggleBookmark } from './diaryActions';
import { useT } from './useT';

/** Diary index: a calendar to jump to any day and a list of pages. */
export function DiaryPanel() {
  const t = useT();
  const open = useUI((s) => s.diaryOpen);
  const setOpen = useUI((s) => s.setDiaryOpen);
  const { pages, current } = useUI((s) => s.diaryState);
  const [styling, setStyling] = useState(false);
  if (!open || !current) return null;

  return (
    <aside
      className="diary-panel floating"
      aria-label={t.diary.index}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <header className="diary-header">
        <h2>{t.diary.title}</h2>
        <span className="diary-count">{t.diary.pageCount(pages.length)}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.bookStyle.label}
          aria-pressed={styling}
          data-active={styling || undefined}
          data-tip={t.bookStyle.label}
          onClick={() => setStyling(!styling)}
        >
          <Palette size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.diary.closeIndex}
          data-tip={`${t.common.close} — Ctrl B`}
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
        {t.commands.newPage}
        <kbd>Alt N</kbd>
      </button>
      <PageList pages={pages} current={current} />
    </aside>
  );
}

function Calendar({ pages, current }: { pages: PageMeta[]; current: PageMeta }) {
  const t = useT();
  const today = todayKey();
  const weekStart = useUI((s) => s.settings.weekStart);
  const [view, setView] = useState(() => monthOf(current.date));
  // When the page changes, the calendar shows its month.
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
    <section className="calendar" aria-label={t.diary.calendar}>
      <div className="calendar-head">
        <button
          type="button"
          className="icon-btn"
          aria-label={t.diary.prevMonth}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <span className="calendar-month">{formatMonth(view.year, view.month)}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.diary.nextMonth}
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

/** Pages from newest to oldest, grouped by month. */
function PageList({ pages, current }: { pages: PageMeta[]; current: PageMeta }) {
  const t = useT();
  if (pages.length === 0) {
    return <p className="page-list-empty">{t.diary.noPages}</p>;
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
  const t = useT();
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
              {page.title || t.diary.untitled}
            </span>
          )}
        </span>
      </button>
      {renaming && (
        <input
          className="page-rename"
          defaultValue={page.title}
          placeholder={t.commands.pageTitle}
          aria-label={t.commands.pageTitle}
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
          aria-label={t.diary.changeTabColor}
          title={t.diary.tabColor}
          onClick={() => cycleBookmarkColor(page.id, BOOKMARK_COLORS)}
        />
      )}
      {!renaming && (
        <span className="page-item-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={page.bookmark ? t.diary.removeTab : t.diary.markImportant}
            aria-pressed={!!page.bookmark}
            title={page.bookmark ? t.diary.removeTab : t.diary.markImportant}
            onClick={() => toggleBookmark(page.id)}
          >
            <Bookmark size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.diary.changeTitle}
            title={t.diary.titleTip}
            onClick={() => setRenaming(true)}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.diary.deletePage}
            title={t.contextMenu.delete}
            onClick={() => void deletePage(page.id)}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </span>
      )}
    </li>
  );
}
