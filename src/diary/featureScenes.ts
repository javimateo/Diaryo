import { routeArrow } from '../engine/arrows';
import { CLOSED_COVER, type BookSpread } from '../engine/book';
import { drawn, dropped, progress, shown, typed, type Clip } from '../engine/clips';
import { coverTemplate } from '../engine/coverTemplates';
import {
  concealNote,
  type ArrowElement,
  type NoteElement,
  type SceneElement,
  type StrokeElement,
  type TextElement,
} from '../engine/elements';
import { note } from './welcome';
import { sketch, spread, tourClip, type TourSceneContext } from './tourScenes';

/**
 * The website's features, each one a little scene played by the engine (like the tour's,
 * whose turning page, dated task and looks it shares). World coordinates as on the
 * welcome page: the left page spans x -760…0, the right one 0…760, both y -520…520.
 */

export type FeatureScene = 'draw' | 'turn' | 'tasks' | 'style' | 'cover' | 'private';

/** A ring drawn round something with the pen: an ellipse that overshoots where it began. */
function ring(name: string, cx: number, cy: number, rx: number, ry: number): StrokeElement {
  const points: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = -2.6 + (i / 48) * Math.PI * 2.15;
    points.push(rx + Math.cos(a) * rx, ry + Math.sin(a) * ry, 0.5);
  }
  return {
    id: `scene-${name}`,
    z: 5,
    x: cx - rx,
    y: cy - ry,
    rotation: -0.03,
    opacity: 1,
    groupId: null,
    locked: false,
    type: 'stroke',
    kind: 'pen',
    points,
    simulatePressure: false,
    color: '#c9677e',
    size: 6,
    fill: null,
    fillStyle: 'hachure',
    label: null,
  };
}

/** The title ringed, a note dropped on the other page and an arrow joining them. */
function draw(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const s = sketch(c);
  const circle = ring('ring', -560, -345, 170, 70);
  const pinned = note('pinned', 6, 140, -330, c.texts.task, 'blue', 0.05, 260);
  const byId = new Map<string, SceneElement>([
    [s.title.id, s.title],
    [pinned.id, pinned],
  ]);
  const arrow: ArrowElement = routeArrow(
    {
      id: 'scene-arrow',
      z: 7,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      groupId: null,
      locked: false,
      type: 'arrow',
      points: [0, 0, 0, 0, 0, 0],
      bend: -70,
      start: { elementId: s.title.id, focus: { x: 0.5, y: 0.5 } },
      end: { elementId: pinned.id, focus: { x: 0.5, y: 0.5 } },
      color: 'blue',
      size: 5,
      roughness: 1,
      seed: 3,
      startHead: 'none',
      endHead: 'arrow',
    },
    (id) => byId.get(id),
  );
  return {
    duration: 3400,
    bounds: { minX: -760, minY: -500, maxX: 460, maxY: -40 },
    frame: (t) => ({
      book,
      elements: shown(
        s.title,
        s.heart,
        drawn(circle, progress(t, 300, 800)),
        dropped(pinned, progress(t, 1300, 500)),
        t < 2000 ? null : { ...arrow, opacity: progress(t, 2000, 500) },
      ),
    }),
  };
}

/** The closed diary dressed up: a drawing, its name and year, and a note stuck on. */
function cover(c: TourSceneContext): Clip {
  const book: BookSpread = { ...spread(c, c.today, 0), closed: true };
  const [mountain, name, year] = coverTemplate(
    'chalk',
    { engraved: '', gilded: '', label: '', chalk: 'diaryo' },
    Number(c.today.slice(0, 4)),
  ) as [StrokeElement, TextElement, TextElement];
  const stuck: NoteElement = note('stuck', 4, 90, -330, c.texts.note, 'pink', 0.12, 190, 'tape');
  return {
    duration: 3000,
    // The cover is upright and the scene lies down: its top, where all of it is.
    bounds: { minX: CLOSED_COVER.minX - 40, minY: -420, maxX: CLOSED_COVER.maxX + 40, maxY: 220 },
    frame: (t) => ({
      book,
      elements: shown(
        drawn(mountain, progress(t, 200, 700)),
        typed(name, progress(t, 1000, 600)),
        typed(year, progress(t, 1600, 300)),
        dropped(stuck, progress(t, 2100, 500)),
      ),
    }),
  };
}

/** A note written, made private (its padlock) and hidden. */
function hidden(c: TourSceneContext): Clip {
  const book = spread(c, c.today, 1);
  const s = sketch(c);
  const secret = note('secret', 6, 60, -420, c.texts.secret, 'blue', 0.04, 300);
  const locked: NoteElement = { ...secret, private: true };
  return {
    duration: 3000,
    bounds: { minX: -760, minY: -500, maxX: 520, maxY: -60 },
    frame: (t) => ({
      book,
      elements: [
        s.title,
        s.heart,
        t < 1500
          ? (typed(secret, progress(t, 200, 900)) ?? { ...secret, text: '' })
          : t < 2300
            ? locked
            : concealNote(locked),
      ],
    }),
  };
}

/** The scene of a feature of the website. */
export function featureClip(scene: FeatureScene, c: TourSceneContext): Clip {
  switch (scene) {
    case 'draw':
      return draw(c);
    case 'turn':
      return tourClip('pages', c);
    case 'tasks':
      return tourClip('upcoming', c);
    case 'style':
      return tourClip('settings', c);
    case 'cover':
      return cover(c);
    case 'private':
      return hidden(c);
  }
}
