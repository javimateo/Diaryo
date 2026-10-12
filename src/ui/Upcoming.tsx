import { CalendarClock, CalendarDays, CalendarPlus, X } from 'lucide-react';
import { useEffect } from 'react';
import { upcoming, type AgendaGroup, type AgendaItem } from '../diary/agenda';
import { formatClock, formatDayMonth, formatWhen } from '../i18n/dates';
import { dayKey } from '../lib/dates';
import { DESK_ID } from '../storage/db';
import { useUI } from '../store/ui';
import { refreshAgenda } from './agenda';
import { revealElement } from './diaryActions';
import { addToCalendar } from './fileActions';
import { useNow } from './useNow';
import { useT } from './useT';

/** What is pending with a date, by group (also for the button's number). */
function useUpcoming() {
  const agenda = useUI((s) => s.agenda);
  const weekStart = useUI((s) => s.settings.weekStart);
  const now = useNow();
  return { groups: upcoming(agenda, now, weekStart), now };
}

/** The top bar's button: "Próximo", with how many are late or for today. */
export function UpcomingButton() {
  const t = useT();
  const open = useUI((s) => s.upcomingOpen);
  const { groups } = useUpcoming();
  const soon = groups
    .filter(({ group }) => group === 'late' || group === 'today')
    .reduce((n, { items }) => n + items.length, 0);
  return (
    <button
      type="button"
      className="icon-btn upcoming-btn"
      aria-label={soon > 0 ? `${t.upcoming.open} (${t.upcoming.soon(soon)})` : t.upcoming.open}
      aria-expanded={open}
      data-active={open || undefined}
      data-tip={open ? undefined : t.upcoming.open}
      data-tip-align="end"
      onClick={() => useUI.getState().setUpcomingOpen(!open)}
    >
      <CalendarClock size={18} strokeWidth={1.75} />
      {soon > 0 && (
        <span className="upcoming-badge" aria-hidden>
          {soon}
        </span>
      )}
    </button>
  );
}

/** "Próximo", from the top bar: just the list, up by its button (the calendar is in the index). */
export function UpcomingPanel() {
  const t = useT();
  const open = useUI((s) => s.upcomingOpen);
  const setOpen = useUI((s) => s.setUpcomingOpen);
  const { groups } = useUpcoming();
  if (!open) return null;
  const pendingItems = groups.flatMap(({ items }) => items);
  const pending = pendingItems.length;
  // Everything pending but the private notes' (one is added from its own row).
  const shareable = pendingItems.filter((item) => !item.private);
  return (
    <aside
      className="diary-panel upcoming-panel floating"
      aria-label={t.upcoming.title}
      onMouseDown={(e) => e.preventDefault()}
    >
      <header className="diary-header">
        <h2>{t.upcoming.title}</h2>
        <span className="diary-count">{pending > 0 && t.upcoming.pending(pending)}</span>
        {shareable.length > 0 && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t.calendar.addAll}
            data-tip={t.calendar.addAll}
            data-tip-align="end"
            onClick={() => void addToCalendar(shareable)}
          >
            <CalendarPlus size={16} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={t.upcoming.close}
          data-tip={`${t.common.close} — Esc`}
          data-tip-align="end"
          onClick={() => setOpen(false)}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>
      <UpcomingList />
    </aside>
  );
}

/** The open tasks and the appointments to come, by when ("Próximo" and the index's tab). */
export function UpcomingList() {
  const t = useT();
  const { groups, now } = useUpcoming();
  // Shown, it reads the diary again (what was just written is there).
  useEffect(() => refreshAgenda(), []);
  if (groups.length === 0) {
    return (
      <p className="upcoming-empty">
        <CalendarClock size={22} strokeWidth={1.75} />
        <span>{t.upcoming.empty}</span>
        <span>{t.upcoming.emptyHint}</span>
      </p>
    );
  }
  return (
    <div className="page-list" data-scrollable>
      {groups.map(({ group, items }) => (
        <section key={group}>
          <h3 data-late={group === 'late' || undefined}>{t.upcoming.groups[group]}</h3>
          <ul>
            {items.map((item) => (
              <UpcomingItem
                key={`${item.pageId}/${item.elementId}/${item.line}`}
                item={item}
                group={group}
                now={now}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** How many are pending (the tab's number). */
export function usePendingCount() {
  return useUpcoming().groups.reduce((n, { items }) => n + items.length, 0);
}

function UpcomingItem({ item, group, now }: { item: AgendaItem; group: AgendaGroup; now: number }) {
  const t = useT();
  const { pages, current } = useUI((s) => s.diaryState);
  // Today and tomorrow say the time; the rest, the day too.
  const time =
    item.time === undefined
      ? t.upcoming.allDay
      : formatClock(item.time) + (item.until === undefined ? '' : `–${formatClock(item.until)}`);
  const when =
    group === 'today' || group === 'tomorrow' ? time : formatWhen(item, dayKey(new Date(now)));
  const page = pages.find((p) => p.id === item.pageId);
  const place =
    item.pageId === DESK_ID
      ? t.palette.desk
      : item.pageId === current?.id
        ? t.palette.thisPage
        : page && [formatDayMonth(page.date), page.title].filter(Boolean).join(' · ');

  const tick = async () => {
    await useUI.getState().diary?.toggleTask(item.pageId, item.elementId, item.line);
    refreshAgenda();
  };

  return (
    <li className="upcoming-item">
      {item.task ? (
        <button
          type="button"
          className="upcoming-check"
          aria-label={`${t.upcoming.tick}: ${item.text}`}
          title={t.upcoming.tick}
          onClick={() => void tick()}
        />
      ) : (
        <CalendarDays className="upcoming-icon" size={15} strokeWidth={1.75} aria-hidden />
      )}
      <button
        type="button"
        className="upcoming-main"
        onClick={() => void revealElement(item.pageId, item.elementId)}
      >
        <span className="upcoming-line">
          <span className="upcoming-text">{item.text || '…'}</span>
          <span className="upcoming-when" data-late={group === 'late' || undefined}>
            {when}
          </span>
        </span>
        {place && <span className="upcoming-place">{place}</span>}
      </button>
      <button
        type="button"
        className="icon-btn upcoming-add"
        aria-label={`${t.calendar.add}: ${item.text}`}
        // In a list that scrolls, the drawn tooltips would be cut off (and stretch it).
        title={t.calendar.add}
        onClick={() => void addToCalendar([item])}
      >
        <CalendarPlus size={15} strokeWidth={1.75} />
      </button>
    </li>
  );
}
