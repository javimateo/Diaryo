import { routeArrow } from '../engine/arrows';
import type {
  ArrowElement,
  NoteElement,
  SceneElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from '../engine/elements';
import type { Color, NoteFill } from '../engine/palette';
import { LINE_HEIGHT } from '../engine/text';
import type { Language } from '../i18n';
import { addDays, todayKey, type DayKey } from '../lib/dates';
import { readJSON, writeJSON } from '../lib/saved';
import { writeDate } from '../lib/when';
import { DESK_ID, DESK_INFO, type DiaryDump, type DiaryoDB, type PageInfo } from '../storage/db';
import { pagePath } from '../storage/tracking';

/**
 * The welcome page: a new diary starts with today's page full of examples to touch (and
 * a note on the desk), made with the usual elements so everything can be moved or
 * deleted. World coordinates: the left page spans x -760…0, the right one 0…760, and
 * both y -520…520.
 */

/** The ids of what the welcome page puts start like this (to remove it all at once). */
export const WELCOME_PREFIX = 'welcome-';

/** The words of the welcome page (in the app's language). */
export interface WelcomeTexts {
  title: string;
  intro: string;
  tasks: string[];
  /** A task with a date: tomorrow's is added after it. */
  datedTask: string;
  draw: string;
  noteMoves: string;
  arrows: string;
  ideas: string;
  photo: string;
  /** An appointment: the day after tomorrow's date is added after it. */
  appointment: string;
  search: string;
  desk: string;
}

const FONT = 'caveat';
const PINK: Color = '#c9677e';

const base = (name: string, z: number, x: number, y: number, rotation = 0) => ({
  id: WELCOME_PREFIX + name,
  z,
  x,
  y,
  rotation,
  opacity: 1,
  groupId: null,
  locked: false,
});

/** Text in a box `width` wide (its height counted from its lines, without measuring). */
export function text(
  name: string,
  z: number,
  x: number,
  y: number,
  value: string,
  width: number,
  fontSize = 40,
  color: Color = 'ink',
): TextElement {
  const lines = value.split('\n').length;
  return {
    ...base(name, z, x, y),
    type: 'text',
    text: value,
    fontSize,
    color,
    font: FONT,
    align: 'left',
    wrap: true,
    width,
    height: fontSize * LINE_HEIGHT * lines,
  };
}

export function note(
  name: string,
  z: number,
  x: number,
  y: number,
  value: string,
  color: NoteFill,
  rotation: number,
  size = 280,
  variant: NoteElement['variant'] = 'tape',
): NoteElement {
  return {
    ...base(name, z, x, y, rotation),
    type: 'note',
    variant,
    text: value,
    fontSize: 36,
    color,
    textColor: null,
    font: FONT,
    align: 'left',
    valign: 'top',
    width: size,
    height: size,
  };
}

/** A highlighter stroke `width` long, a little wavy like a real one. */
export function highlight(
  name: string,
  z: number,
  x: number,
  y: number,
  width: number,
): StrokeElement {
  const points: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    points.push(t * width, Math.sin(t * Math.PI * 1.5) * 3, 0.5);
  }
  return {
    ...base(name, z, x, y),
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

/** A heart drawn with the pen, `size` wide, from its top left corner. */
export function heart(name: string, z: number, x: number, y: number, size: number): StrokeElement {
  const k = size / 34;
  const points: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push((hx + 17) * k, (13 - hy) * k, 0.5);
  }
  return {
    ...base(name, z, x, y),
    type: 'stroke',
    kind: 'pen',
    points,
    simulatePressure: false,
    color: PINK,
    size: 6,
    fill: null,
    fillStyle: 'hachure',
    label: null,
  };
}

/** What goes on the welcome page (today being `today`), and the note on the desk. */
export function welcomeElements(
  t: WelcomeTexts,
  today: DayKey,
  language: Language,
): { page: SceneElement[]; desk: SceneElement[] } {
  const tomorrow = writeDate({ day: addDays(today, 1), time: 10 * 60 }, language);
  const later = writeDate({ day: addDays(today, 2), time: 18 * 60 }, language);
  const tasks = [
    ...t.tasks.map((task, i) => `[${i === 0 ? 'x' : ' '}] ${task}`),
    `[ ] ${t.datedTask} ${tomorrow}`,
  ].join('\n');

  const arrowsText = text('arrows', 7, 400, -400, t.arrows, 320, 38);
  const ideas: ShapeElement = {
    ...base('ideas', 8, 440, -150, -0.02),
    type: 'shape',
    shape: 'rect',
    color: 'blue',
    border: true,
    strokeWidth: 3,
    roughness: 1,
    seed: 7,
    fill: null,
    fillStyle: 'hachure',
    width: 260,
    height: 120,
    label: { text: t.ideas, fontSize: 48, font: FONT, align: 'center', valign: 'middle' },
  };
  const byId = new Map<string, SceneElement>([
    [arrowsText.id, arrowsText],
    [ideas.id, ideas],
  ]);
  const arrow: ArrowElement = routeArrow(
    {
      ...base('arrow', 9, 0, 0),
      type: 'arrow',
      points: [0, 0, 0, 0, 0, 0],
      bend: -60,
      start: { elementId: arrowsText.id, focus: { x: 0.5, y: 0.5 } },
      end: { elementId: ideas.id, focus: { x: 0.5, y: 0.5 } },
      color: 'blue',
      size: 3,
      roughness: 1,
      seed: 11,
      startHead: 'none',
      endHead: 'arrow',
    },
    (id) => byId.get(id),
  );

  const photo = note('photo', 10, 60, -50, t.photo, '#fbf8f1', 0.06, 260);
  return {
    page: [
      highlight('highlight', 1, -700, -300, 560),
      text('title', 2, -690, -350, t.title, 640, 64),
      text('intro', 3, -690, -240, t.intro, 620),
      text('tasks', 4, -690, -100, tasks, 640),
      heart('heart', 5, -680, 220, 190),
      text('draw', 6, -450, 240, t.draw, 400, 38, PINK),
      note('moves', 7, 50, -400, t.noteMoves, 'yellow', -0.05, 300),
      arrowsText,
      ideas,
      arrow,
      { ...photo, align: 'center', valign: 'middle', textColor: '#8c877e' },
      note('appointment', 11, 420, 90, `${t.appointment}\n${later}`, 'blue', 0.04, 270, 'pin'),
      text('search', 12, 60, 400, t.search, 660, 38),
    ],
    desk: [note('desk', 1, 830, -160, t.desk, 'pink', 0.08, 250, 'clip')],
  };
}

/** The welcome page's id. */
export const WELCOME_PAGE = `${WELCOME_PREFIX}page`;

/** Set once the app has decided about the welcome page (shown or not): never again. */
const DECIDED_KEY = 'diaryo:welcome';

/**
 * The welcome page (and its note on the desk) as a diary of its own, today being `today`:
 * to put it, or to write it again in another language.
 */
export function welcomeDump(t: WelcomeTexts, today: DayKey, language: Language): DiaryDump {
  const now = Date.now();
  const { page, desk } = welcomeElements(t, today, language);
  const row = (info: PageInfo) => ({
    ...info,
    createdAt: now,
    updatedAt: now,
    camera: null,
    thumbnail: null,
  });
  const welcome = { id: WELCOME_PAGE, date: today, order: now, title: '' };
  return {
    pages: [
      {
        page: row(welcome),
        elements: page.map((data) => ({ pageId: WELCOME_PAGE, id: data.id, data })),
      },
      {
        page: row(DESK_INFO),
        elements: desk.map((data) => ({ pageId: DESK_ID, id: data.id, data })),
      },
    ],
    assets: [],
    fonts: [],
  };
}

/**
 * The first time the app opens: if the diary is empty, today's page is the welcome page.
 * It is written as it is, without marking it for the cloud: a new device that then joins
 * a diary in the cloud doesn't add it there (it goes up only if it is changed). Says
 * whether it was put.
 */
export async function seedWelcome(
  db: DiaryoDB,
  t: WelcomeTexts,
  language: Language,
): Promise<boolean> {
  if (readJSON(DECIDED_KEY) !== null) return false;
  writeJSON(DECIDED_KEY, { at: Date.now() });
  if ((await db.pages.count()) > 0 || (await db.elements.count()) > 0) return false;
  const { pages } = welcomeDump(t, todayKey(), language);
  await db.pages.bulkPut(pages.map(({ page }) => page));
  await db.elements.bulkPut(pages.flatMap(({ elements }) => elements));
  return true;
}

/**
 * Whether the diary is only the welcome page as it was put: its examples and nothing
 * else, none of them changed (every change is tracked for the cloud, and the welcome page
 * is written without it). It isn't a diary of one's own yet.
 */
export async function onlyWelcome(db: DiaryoDB): Promise<boolean> {
  const [elements, pages, tracked, assets] = await Promise.all([
    db.elements.toCollection().primaryKeys(),
    db.pages.toCollection().primaryKeys(),
    db.tracked.toCollection().primaryKeys(),
    db.assets.count(),
  ]);
  return (
    elements.length > 0 &&
    assets === 0 &&
    elements.every(([, id]) => id.startsWith(WELCOME_PREFIX)) &&
    pages.every((id) => id === WELCOME_PAGE || id === DESK_ID) &&
    !tracked.some((path) => path.startsWith('el/') || path === pagePath(WELCOME_PAGE))
  );
}
