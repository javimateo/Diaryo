import { routeArrow } from '@app/engine/arrows';
import { fitContainer } from '@app/engine/containers';
import { fitNote, fitText } from '@app/engine/editing';
import type {
  ArrowElement,
  NoteElement,
  SceneElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from '@app/engine/elements';
import type { NoteFill } from '@app/engine/palette';
import type { NoteVariant } from '@app/engine/notes';
import { addDays, todayKey } from '@app/lib/dates';
import { DESK_ID, type DiaryoDB, type PageRow } from '@app/storage/db';
import type { WebMessages } from '../i18n/es';

/**
 * The demo diary: today's double page, yesterday's and two notes on the desk, built with
 * the app's own elements. World coordinates: the left page spans x -760…0, the right one
 * 0…760, and both y -520…520.
 */

const FONT = 'caveat';

/** Today's page: the demo always opens on it. */
export const TODAY_PAGE = 'demo-today';

const base = (id: string, z: number, x: number, y: number, rotation = 0) => ({
  id,
  z,
  x,
  y,
  rotation,
  opacity: 1,
  groupId: null,
  locked: false,
});

function text(id: string, z: number, x: number, y: number, value: string, fontSize: number) {
  const el: TextElement = {
    ...base(id, z, x, y),
    type: 'text',
    text: value,
    fontSize,
    color: 'ink',
    font: FONT,
    align: 'left',
    wrap: false,
    width: 0,
    height: 0,
  };
  return fitText(el);
}

interface NoteOptions {
  color: NoteFill;
  variant: NoteVariant;
  rotation: number;
  size?: number;
  fontSize?: number;
}

function note(id: string, z: number, x: number, y: number, value: string, o: NoteOptions) {
  const size = o.size ?? 230;
  const el: NoteElement = {
    ...base(id, z, x, y, o.rotation),
    type: 'note',
    variant: o.variant,
    text: value,
    fontSize: o.fontSize ?? 36,
    color: o.color,
    textColor: null,
    font: FONT,
    align: 'left',
    valign: 'top',
    width: size,
    height: size,
  };
  return fitNote(el);
}

/** A highlighter stroke from x to x + width, a little wavy like a real one. */
function highlight(id: string, z: number, x: number, y: number, width: number): StrokeElement {
  const points: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    points.push(t * width, Math.sin(t * Math.PI * 1.5) * 3, 0.5);
  }
  return {
    ...base(id, z, x, y),
    type: 'stroke',
    kind: 'marker',
    points,
    simulatePressure: false,
    color: 'yellow',
    size: 30,
    fill: null,
    fillStyle: 'hachure',
    label: null,
  };
}

function todayPage(t: WebMessages): SceneElement[] {
  const b = t.book;
  const title = text('demo-title', 3, -680, -372, b.heading, 68);
  const tasks = b.tasks.map((task, i) => `[${i === b.doneTask ? 'x' : ' '}] ${task}`).join('\n');
  const box: ShapeElement = fitContainer({
    ...base('demo-box', 4, 170, -300, -0.03),
    type: 'shape',
    shape: 'rect',
    color: 'ink',
    border: true,
    strokeWidth: 3,
    roughness: 1,
    seed: 7,
    fill: null,
    fillStyle: 'hachure',
    width: 420,
    height: 240,
    label: { text: b.boxed, fontSize: 52, font: FONT, align: 'center', valign: 'middle' },
  });
  const byId = new Map<string, SceneElement>([
    [title.id, title],
    [box.id, box],
  ]);
  const arrow: ArrowElement = routeArrow(
    {
      ...base('demo-arrow', 5, 0, 0),
      type: 'arrow',
      points: [0, 0, 0, 0, 0, 0],
      bend: -90,
      start: { elementId: title.id, focus: { x: 0.5, y: 0.5 } },
      end: { elementId: box.id, focus: { x: 0.5, y: 0.5 } },
      color: 'blue',
      size: 3,
      roughness: 1,
      seed: 11,
      startHead: 'none',
      endHead: 'arrow',
    },
    (id) => byId.get(id),
  );
  return [
    highlight('demo-highlight', 1, -690, -300, title.width + 20),
    title,
    text('demo-tasks', 2, -680, -200, tasks, 44),
    box,
    arrow,
    note('demo-corner', 6, -560, 190, b.pageNote, {
      color: 'green',
      variant: 'strip',
      rotation: -0.05,
    }),
  ];
}

function yesterdayPage(t: WebMessages): SceneElement[] {
  const y = t.demo.yesterday;
  return [
    text('demo-y-title', 1, -680, -372, y.heading, 68),
    text('demo-y-list', 2, -680, -250, y.list, 44),
    note('demo-y-note', 3, 200, -300, y.note, { color: 'pink', variant: 'pin', rotation: -0.04 }),
  ];
}

/** How far right the desk notes reach (world x): the demo frames them too. */
export const DESK_RIGHT = 990;

/** On the desk, outside the book: they stay there whatever page is open. */
function desk(t: WebMessages): SceneElement[] {
  return [
    note('demo-desk-todo', 1, 725, 130, t.book.deskNote, {
      color: 'yellow',
      variant: 'tape',
      rotation: 0.06,
    }),
    note('demo-desk-shortcut', 2, 735, -330, t.book.shortcutNote, {
      color: 'pink',
      variant: 'clip',
      rotation: -0.07,
    }),
  ];
}

/** Writes the demo diary into an empty database. */
export async function seedDiary(db: DiaryoDB, t: WebMessages) {
  const today = todayKey();
  const now = Date.now();
  const page = (id: string, date: string, order: number): PageRow => ({
    id,
    date,
    order,
    title: '',
    createdAt: now,
    updatedAt: now,
    camera: null,
    thumbnail: null,
  });
  const pages: [PageRow, SceneElement[]][] = [
    [page('demo-yesterday', addDays(today, -1), now - 1), yesterdayPage(t)],
    [page(TODAY_PAGE, today, now), todayPage(t)],
  ];
  await db.pages.bulkPut(pages.map(([row]) => row));
  await db.elements.bulkPut([
    ...pages.flatMap(([row, elements]) =>
      elements.map((data) => ({ pageId: row.id, id: data.id, data })),
    ),
    ...desk(t).map((data) => ({ pageId: DESK_ID, id: data.id, data })),
  ]);
}
