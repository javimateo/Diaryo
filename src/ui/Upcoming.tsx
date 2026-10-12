import { CalendarClock, CalendarDays } from 'lucide-react';
import { useEffect } from 'react';
import { upcoming, type AgendaGroup, type AgendaItem } from '../diary/agenda';
import { formatClock, formatDayMonth, formatWhen } from '../i18n/dates';
import { dayKey } from '../lib/dates';
import { DESK_ID } from '../storage/db';
import { useUI } from '../store/ui';
import { refreshAgenda } from './agenda';
import { revealElement } from './diaryActions';
import { useNow } from './useNow';
import { useT } from './useT';

/** What is pending with a date, by group (also for the button's number). */
function useUpcoming() {
  const agenda = useUI((s) => s.agenda);
  const weekStart = useUI((s) => s.settings.weekStart);
  const now = useNow();
  return { groups: upcoming(agenda, now, weekStart), now };
}

/**
 * The top bar's button: "Próximo", with how many are late or for today. It opens the
 * diary index on its tasks.
 */
export function UpcomingButton() {
  const t = useT();
  const open = useUI((s) => s.diaryOpen && s.diaryTab === 'tasks');
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
      onClick={() => useUI.getState().setDiaryOpen(!open, 'tasks', 'top')}
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

/** The diary index's "Tareas": the open tasks and the appointments to come, by when. */
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
          data-tip={t.upcoming.tick}
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
    </li>
  );
}
