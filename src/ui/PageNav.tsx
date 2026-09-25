import { Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import { todayKey } from '../lib/dates';
import { formatDay, relativeDay } from '../i18n/dates';
import { positionInDay } from '../diary/pages';
import { useUI } from '../store/ui';
import { goToToday, toggleBookmark, turnPage } from './diaryActions';
import { useT } from './useT';

/** Page footer: the date (or title) of the open page and arrows to turn the page. */
export function PageNav() {
  const t = useT();
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
    position && t.diary.pageOf(position.index, position.total),
  ].filter(Boolean);

  return (
    <div className="page-nav-wrap">
      {current.date !== today && (
        <button
          type="button"
          className="today-btn floating"
          data-tip={`${t.commands.today} — Ctrl ${t.keys.home}`}
          data-tip-side="top"
          onMouseDown={(e) => e.preventDefault()}
          onClick={goToToday}
        >
          {t.dates.today}
        </button>
      )}
      <nav
        className="page-nav floating"
        aria-label={t.palette.pages}
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label={t.commands.prevPage}
          data-tip={`${t.commands.prevPage} — Ctrl ←`}
          data-tip-side="top"
          onClick={() => void turnPage(-1)}
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="page-label"
          aria-expanded={diaryOpen}
          data-tip={diaryOpen ? undefined : `${t.diary.index} — Ctrl B`}
          data-tip-side="top"
          onClick={() => setDiaryOpen(!diaryOpen)}
        >
          <span className="page-title">{current.title || day}</span>
          {details.length > 0 && <span className="page-details">{details.join(' · ')}</span>}
        </button>
        <button
          type="button"
          className="icon-btn bookmark-btn"
          aria-label={current.bookmark ? t.diary.removeTab : t.diary.markImportant}
          aria-pressed={!!current.bookmark}
          data-tip={`${current.bookmark ? t.diary.removeTab : t.diary.markImportant} — Alt M`}
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
          aria-label={t.commands.nextPage}
          data-tip={`${t.commands.nextPage} — Ctrl →`}
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
