import type { PaperStyle } from '../engine/book';
import type { DayKey } from '../lib/dates';

/** A diary page as the UI sees it. */
export interface PageMeta {
  id: string;
  date: DayKey;
  order: number;
  title: string;
  thumbnail: string | null;
  /** The thumbnail is the whole double page (older ones were only the content). */
  thumbnailSpread?: boolean;
  /** Tab color if the page is marked as important. */
  bookmark: string | null;
  /** This page's own paper; null = the whole diary's. */
  paper?: PaperStyle | null;
  updatedAt: number;
}

export function comparePages(a: PageMeta, b: PageMeta): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order;
}

export function sortPages(pages: PageMeta[]): PageMeta[] {
  return [...pages].sort(comparePages);
}

/** New page (not saved yet: it is saved when something is written on it). */
export function newPage(date: DayKey, now = Date.now()): PageMeta {
  return {
    id: crypto.randomUUID(),
    date,
    order: now,
    title: '',
    thumbnail: null,
    bookmark: null,
    updatedAt: 0,
  };
}

/** Pages of a day, in order. */
export function pagesOfDay(pages: PageMeta[], date: DayKey): PageMeta[] {
  return sortPages(pages.filter((page) => page.date === date));
}

/**
 * The page to open instead of a blank one (nothing on it, no title) because a page of that
 * same day came from another device: the last one of the day, among `arrived` if given.
 */
export function arrivedInstead(
  pages: PageMeta[],
  current: PageMeta,
  blank: boolean,
  arrived?: ReadonlySet<string>,
): PageMeta | undefined {
  if (!blank || current.title) return undefined;
  return pagesOfDay(pages, current.date)
    .filter((page) => page.id !== current.id && (!arrived || arrived.has(page.id)))
    .at(-1);
}

const withPage = (pages: PageMeta[], page: PageMeta) =>
  pages.some((p) => p.id === page.id) ? pages : [...pages, page];

/** Previous (-1) or next (1) page in the diary, or null if there are no more. */
export function neighbor(pages: PageMeta[], current: PageMeta, direction: 1 | -1) {
  const sorted = sortPages(withPage(pages, current));
  const index = sorted.findIndex((p) => p.id === current.id);
  return sorted[index + direction] ?? null;
}

/** Position within the day ("2 of 3"), or null if it is the only page of the day. */
export function positionInDay(pages: PageMeta[], current: PageMeta) {
  const day = pagesOfDay(withPage(pages, current), current.date);
  if (day.length < 2) return null;
  return { index: day.findIndex((p) => p.id === current.id) + 1, total: day.length };
}
