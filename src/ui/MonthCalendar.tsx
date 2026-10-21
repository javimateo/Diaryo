import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { monthGrid, parseDay, todayKey, type DayKey } from '../lib/dates';
import { formatDay, formatMonth, weekdayInitials } from '../i18n/dates';
import { useUI } from '../store/ui';
import { useT } from './useT';

interface Props {
  /** The chosen day: it is highlighted and its month is shown when it changes. */
  selected: DayKey;
  onPick: (day: DayKey) => void;
  /** Days with pages (a dot under the number). */
  marked?: Set<DayKey>;
  /** How many appointments or pending tasks each day has (a dot at the top). */
  dated?: Map<DayKey, number>;
}

/** A month to pick a day, with arrows to the previous and next ones. */
export function MonthCalendar({ selected, onPick, marked, dated }: Props) {
  const t = useT();
  const today = todayKey();
  const weekStart = useUI((s) => s.settings.weekStart);
  const [view, setView] = useState(() => monthOf(selected));
  // When the chosen day changes, its month is shown.
  const [shownFor, setShownFor] = useState(selected);
  if (shownFor !== selected) {
    setShownFor(selected);
    setView(monthOf(selected));
  }

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
          .map((day, i) => {
            if (!day) return <span key={`empty-${i}`} />;
            const count = dated?.get(day);
            const name = formatDay(day, today);
            const label = count ? `${name} · ${t.upcoming.dayHas(count)}` : name;
            return (
              <button
                key={day}
                type="button"
                className="calendar-day"
                aria-label={label}
                data-tip={count ? label : undefined}
                aria-current={day === selected ? 'date' : undefined}
                data-today={day === today || undefined}
                data-pages={marked?.has(day) || undefined}
                data-dated={count || undefined}
                onClick={() => onPick(day)}
              >
                {parseDay(day).getDate()}
              </button>
            );
          })}
      </div>
    </section>
  );
}

const monthOf = (day: DayKey) => {
  const date = parseDay(day);
  return { year: date.getFullYear(), month: date.getMonth() };
};
