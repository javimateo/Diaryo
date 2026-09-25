import type { PaperStyle } from '../engine/book';
import type { DayKey } from './dates';

/** Una página del diario tal como la ve la interfaz. */
export interface PageMeta {
  id: string;
  date: DayKey;
  order: number;
  title: string;
  thumbnail: string | null;
  /** La miniatura es la doble página entera (las antiguas eran solo el contenido). */
  thumbnailSpread?: boolean;
  /** Color de la pestaña si la página está marcada como importante. */
  bookmark: string | null;
  /** Hoja propia de esta página; null = la de todo el diario. */
  paper?: PaperStyle | null;
  updatedAt: number;
}

export function comparePages(a: PageMeta, b: PageMeta): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order;
}

export function sortPages(pages: PageMeta[]): PageMeta[] {
  return [...pages].sort(comparePages);
}

/** Página nueva (aún sin guardar: se guarda al escribir algo en ella). */
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

/** Páginas de un día, en orden. */
export function pagesOfDay(pages: PageMeta[], date: DayKey): PageMeta[] {
  return sortPages(pages.filter((page) => page.date === date));
}

const withPage = (pages: PageMeta[], page: PageMeta) =>
  pages.some((p) => p.id === page.id) ? pages : [...pages, page];

/** Página anterior (-1) o siguiente (1) en el diario, o null si no hay más. */
export function neighbor(pages: PageMeta[], current: PageMeta, direction: 1 | -1) {
  const sorted = sortPages(withPage(pages, current));
  const index = sorted.findIndex((p) => p.id === current.id);
  return sorted[index + direction] ?? null;
}

/** Posición dentro del día ("2 de 3"), o null si es la única página del día. */
export function positionInDay(pages: PageMeta[], current: PageMeta) {
  const day = pagesOfDay(withPage(pages, current), current.date);
  if (day.length < 2) return null;
  return { index: day.findIndex((p) => p.id === current.id) + 1, total: day.length };
}
