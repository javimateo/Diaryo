import { addDays, dayKey, parseDay, type DayKey } from '../lib/dates';
import { endOf, findDates, type DateMark, type When } from '../lib/when';
import type { TextEntry } from '../storage/db';

/** A line with a date: a task (with a checkbox) or an appointment (without one). */
export interface AgendaItem extends When {
  pageId: string;
  elementId: string;
  /** Its line in the element's text. */
  line: number;
  /** What it says, without its checkbox and its date. */
  text: string;
  task: 'open' | 'done' | null;
  /** In a private note: its words aren't shown outside the diary (a reminder). */
  private?: true;
}

const TASK = /^\s*\[([ xX])\]/;

/** A line without its checkbox and its dates. */
function words(line: string, marks: DateMark[]): string {
  let text = '';
  let from = 0;
  for (const mark of marks) {
    text += line.slice(from, mark.start);
    from = mark.end;
  }
  return (text + line.slice(from)).replace(TASK, '').replace(/\s+/g, ' ').trim();
}

/**
 * The lines with a date in everything written. A line with only a date says what it is
 * with the element's first line that has words ("Médico" over "@15 oct 2026 10:00").
 */
export function agendaItems(entries: TextEntry[], today: DayKey, monthFirst: boolean) {
  const items: AgendaItem[] = [];
  for (const { pageId, elementId, text, private: hidden } of entries) {
    if (!text.includes('@')) continue;
    const lines = text.split('\n');
    const marks = lines.map((line) => findDates(line, today, monthFirst));
    lines.forEach((line, index) => {
      const [first] = marks[index];
      if (!first) return;
      const task = TASK.exec(line);
      const own = words(line, marks[index]);
      const named = own || lines.map((other, i) => words(other, marks[i])).find(Boolean) || '';
      items.push({
        pageId,
        elementId,
        line: index,
        text: named,
        task: task ? (task[1] === ' ' ? 'open' : 'done') : null,
        day: first.day,
        time: first.time,
        until: first.until,
        ...(hidden && { private: true as const }),
      });
    });
  }
  return items;
}

/** When it reminds of it: at its time (9:00 without one), `before` minutes earlier. */
export function remindAt(item: When, before: number): number {
  const date = parseDay(item.day);
  date.setHours(0, (item.time ?? 9 * 60) - before, 0, 0);
  return date.getTime();
}

export type AgendaGroup = 'late' | 'today' | 'tomorrow' | 'week' | 'later';

/** Still to do or to come: open tasks (also late ones) and appointments not over yet. */
export const isPending = (item: AgendaItem, now: number) =>
  item.task === 'open' || (item.task === null && now < endOf(item));

/**
 * What is pending, in groups: late tasks, today, tomorrow, the rest of this week (it
 * starts on `weekStart`) and later. Each one in time order, the whole day first.
 */
export function upcoming(items: AgendaItem[], now: number, weekStart: 0 | 1) {
  const today = dayKey(new Date(now));
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, ((weekStart - parseDay(today).getDay() + 7) % 7 || 7) - 1);
  const groupOf = (item: AgendaItem): AgendaGroup => {
    if (now >= endOf(item)) return 'late';
    if (item.day <= today) return 'today';
    if (item.day === tomorrow) return 'tomorrow';
    return item.day <= weekEnd ? 'week' : 'later';
  };
  const order = (item: AgendaItem) => `${item.day} ${String(item.time ?? -1).padStart(4, '0')}`;
  const groups = new Map<AgendaGroup, AgendaItem[]>(
    (['late', 'today', 'tomorrow', 'week', 'later'] as const).map((group) => [group, []]),
  );
  for (const item of [...items].sort((a, b) => order(a).localeCompare(order(b)))) {
    if (isPending(item, now)) groups.get(groupOf(item))!.push(item);
  }
  return [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({ group, items: list }));
}
