import {
  bookBounds,
  COVER_COLORS,
  PAPER_STYLES,
  type BookLabels,
  type BookSpread,
  type BookStyle,
} from '../engine/book';
import { drawn, dropped, progress, shown, typed, type Clip } from '../engine/clips';
import { DESKS } from '../engine/desk';
import type { Bounds } from '../engine/geometry';
import type { Language, Messages } from '../i18n';
import { formatDay } from '../i18n/dates';
import { addDays, type DayKey } from '../lib/dates';
import { writeDate } from '../lib/when';
import { heart, highlight, note, text } from './welcome';

/**
 * The tour's little scenes: each step shows what it explains, played by the engine with
 * the welcome page's own elements, on the user's book and in their language. World
 * coordinates as on the welcome page: the left page spans x -760…0, both y -520…520.
 */

export type TourStep = keyof Messages['tour']['steps'];

export type TourSceneTexts = Messages['tour']['scenes'];

export interface TourSceneContext {
  texts: TourSceneTexts;
  style: BookStyle;
  labels: BookLabels;
  language: Language;
  today: DayKey;
}

/** The top of the left page, with its date and the first lines. */
const PAGE_TOP: Bounds = { minX: -760, minY: -500, maxX: 0, maxY: -60 };

export function spread(
  c: TourSceneContext,
  day: DayKey,
  pageNumber: number,
  style = c.style,
): BookSpread {
  return {
    style,
    date: formatDay(day, c.today),
    title: '',
    today: day === c.today,
    pageNumber,
    tabs: [],
    labels: c.labels,
  };
}

/** The title being written, its underline and a heart: the pen, the marker and text. */
export function sketch(c: TourSceneContext) {
  return {
    title: text('title', 2, -700, -400, c.texts.title, 640, 90),
    line: highlight('highlight', 1, -705, -300, 280),
    heart: heart('heart', 3, -680, -240, 170),
    note: { ...note('note', 4, -400, -270, c.texts.note, 'yellow', -0.06, 210), fontSize: 50 },
  };
}

/** Writing, underlining, drawing and a note that drops onto the page. */
function tools(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const s = sketch(c);
  return {
    duration: 3000,
    bounds: PAGE_TOP,
    frame: (t) => ({
      book,
      elements: shown(
        typed(s.title, progress(t, 150, 800)),
        drawn(s.line, progress(t, 1000, 350)),
        drawn(s.heart, progress(t, 1350, 900)),
        dropped(s.note, progress(t, 2250, 500)),
      ),
    }),
  };
}

/** Yesterday's page turns and today's comes: the book draws its date. */
function pages(c: TourSceneContext, desk: boolean): Clip {
  const yesterday = spread(c, addDays(c.today, -1), 1);
  const today = spread(c, c.today, 3);
  const before = [
    text('yesterday', 1, -700, -440, c.texts.yesterday, 680, 100),
    heart('heart', 2, -640, -250, 300),
    note('note', 3, 120, -380, c.texts.note, 'blue', 0.05, 320),
  ];
  const after = text('today', 1, -700, -440, c.texts.today, 680, 100);
  const deskNote = note('desk', 10, 840, -220, c.texts.desk, 'pink', 0.08, 300, 'clip');
  const turnAt = desk ? 900 : 450;
  const turned = turnAt + 1000;
  const bounds = bookBounds(today);
  return {
    duration: turned + 900,
    bounds: desk ? { ...bounds, maxX: 1160 } : bounds,
    turns: [{ at: turnAt, dir: 1, duration: 1000 }],
    frame: (t) => {
      const page = t < turned ? before : shown(typed(after, progress(t, turned + 150, 600)));
      if (!desk) return { book: t < turned ? yesterday : today, elements: page };
      return {
        book: t < turned ? yesterday : today,
        elements: shown(...page, dropped(deskNote, progress(t, 150, 500))),
        desk: [deskNote.id],
      };
    },
  };
}

/** A task gets a date by writing it ("@tomorrow 10") and another one is ticked. */
function upcoming(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const tomorrow = writeDate({ day: addDays(c.today, 1), time: 10 * 60 }, c.language);
  const task = (done: boolean) =>
    text('task', 1, -700, -390, `[${done ? 'x' : ' '}] ${c.texts.task}`, 680, 60);
  const open = task(false);
  const done = task(true);
  const writing = text('dated', 2, -700, -300, `[ ] ${c.texts.datedTask} `, 680, 60);
  // The date is written all at once: it becomes a label when editing ends.
  const dated = text('dated', 2, -700, -300, `[ ] ${c.texts.datedTask} ${tomorrow}`, 680, 60);
  return {
    duration: 2800,
    bounds: { ...PAGE_TOP, maxY: -110 },
    frame: (t) => ({
      book,
      elements: shown(
        t < 2200 ? open : done,
        t < 1500 ? typed(writing, progress(t, 200, 1100), 4) : dated,
      ),
    }),
  };
}

/** The page searched (the palette over it is the tour's own). */
function search(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const s = sketch(c);
  return {
    duration: 0,
    bounds: PAGE_TOP,
    frame: () => ({ book, elements: [s.title, s.line, s.heart, s.note] }),
  };
}

/** The first of these that isn't `current`. */
const other = <T>(options: readonly T[], current: T, skip = 0) =>
  options.filter((option) => option !== current)[skip];

/** The book trying on other covers, papers and desks, and back to the user's. */
function settings(c: TourSceneContext): Clip {
  const style = c.style;
  // A material with its own color would hide the change of color.
  const material = style.material === 'kraft' ? 'leather' : style.material;
  const look = (i: number): BookStyle => ({
    ...style,
    material,
    cover: other(COVER_COLORS, style.cover, i),
    paper: other(PAPER_STYLES, style.paper, i),
    desk: other(DESKS, style.desk, i + 1),
  });
  const books = [look(0), look(1), style].map((s) => spread(c, c.today, 1, s));
  const s = sketch(c);
  const elements = [s.title, s.line, s.heart];
  return {
    duration: 1900,
    bounds: bookBounds(books[2]),
    frame: (t) => ({ book: books[t < 700 ? 0 : t < 1400 ? 1 : 2], elements }),
  };
}

/** The book alone, over another program (the tour draws the desktop around it). */
function floating(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const s = sketch(c);
  const { minX, minY, maxX, maxY } = bookBounds(book);
  return {
    duration: 0,
    // Smaller than the scene, with the program showing around it.
    bounds: { minX: minX - 500, minY: minY - 150, maxX: maxX + 120, maxY: maxY + 150 },
    transparent: true,
    frame: () => ({ book, elements: [s.title, s.line, s.heart, s.note] }),
  };
}

/** The scene of a step of the tour. */
export function tourClip(step: TourStep, c: TourSceneContext): Clip {
  switch (step) {
    case 'tools':
      return tools(c);
    case 'pages':
      return pages(c, false);
    case 'desk':
      return pages(c, true);
    case 'upcoming':
      return upcoming(c);
    case 'search':
      return search(c);
    case 'settings':
      return settings(c);
    case 'floating':
      return floating(c);
  }
}
