import { DESK_ID } from '../storage/db';
import { formatClock, formatDay, formatDayMonth, relativeDay } from '../i18n/dates';
import { t } from '../i18n';
import { dayKey } from '../lib/dates';
import { isPending, remindAt, type AgendaItem } from './agenda';
import type { PageMeta } from './pages';

/** A Windows notification, as the desktop side shows it (src-tauri/src/reminders.rs). */
export interface Reminder {
  /** The same reminder keeps it: it is never shown twice. */
  key: string;
  /** When (ms). */
  at: number;
  title: string;
  body: string;
  /** What a click opens: the element, or without it, the index's tasks. */
  pageId?: string;
  elementId?: string;
}

/** Those missed longer ago than this aren't told any more. */
const MISSED_WITHIN = 24 * 60 * 60 * 1000;
/** The desktop side keeps the next ones only. */
const MAX_REMINDERS = 100;

/** "Hoy a las 10:00", "Mañana, todo el día", "Jueves, 15 de octubre a las 12:00". */
function whenText(item: AgendaItem, now: number) {
  const today = dayKey(new Date(now));
  const day = relativeDay(item.day, today) ?? formatDay(item.day, today);
  const r = t().reminders;
  return item.time === undefined ? r.allDay(day) : r.atTime(day, formatClock(item.time));
}

/** Where it is: the desk, or its page's title or day. */
function placeOf(item: AgendaItem, pages: PageMeta[]) {
  if (item.pageId === DESK_ID) return t().palette.desk;
  const page = pages.find((p) => p.id === item.pageId);
  return page ? page.title || formatDayMonth(page.date) : null;
}

/**
 * The reminders to come, `before` minutes before each one's time, and those that came due
 * after `since` (written right at their time: the desktop side shows them at once). Never
 * of done tasks. With `hidden` (the whole diary encrypted) or for a private note, without
 * its words.
 */
export function buildReminders(
  items: AgendaItem[],
  now: number,
  before: number,
  hidden: boolean,
  pages: PageMeta[],
  since = now,
): Reminder[] {
  const r = t().reminders;
  // An appointment without an end is over at its time, but just begun it still reminds.
  return items
    .filter((item) => item.task !== 'done')
    .map((item) => ({ item, at: remindAt(item, before) }))
    .filter(({ at }) => at > since)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_REMINDERS)
    .map(({ item, at }) => {
      const when = whenText(item, now);
      const secret = hidden || item.private === true;
      const place = placeOf(item, pages);
      return {
        key: `${item.pageId}/${item.elementId}/${item.line}/${at}`,
        at,
        title: secret ? r.hidden : item.text,
        body: secret ? `${when} · ${r.openToSee}` : place ? `${when} · ${place}` : when,
        pageId: item.pageId,
        elementId: item.elementId,
      };
    });
}

/** What reminded between `from` and `now` and is still pending (diaryo was closed). */
export function missedReminder(
  items: AgendaItem[],
  from: number,
  now: number,
  before: number,
  hidden: boolean,
): Reminder | null {
  const missed = items.filter((item) => {
    const at = remindAt(item, before);
    return at > Math.max(from, now - MISSED_WITHIN) && at <= now && isPending(item, now);
  });
  if (missed.length === 0) return null;
  const r = t().reminders;
  const shown = hidden ? [] : missed.filter((item) => !item.private).map((item) => item.text);
  return {
    key: `missed/${now}`,
    at: now,
    title: r.missed(missed.length),
    body: shown.length > 0 ? shown.slice(0, 3).join(' · ') : r.openToSee,
  };
}
