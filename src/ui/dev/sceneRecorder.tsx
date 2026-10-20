import '../../fonts';
import '../../styles/tokens.css';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { featureClip, type FeatureScene } from '../../diary/featureScenes';
import { tourClip, type TourSceneContext } from '../../diary/tourScenes';
import { DEFAULT_BOOK_STYLE } from '../../engine/book';
import type { Clip } from '../../engine/clips';
import { fonts } from '../../engine/fonts';
import { setTextDates } from '../../engine/text';
import { LANGUAGES, setLanguage, t, type Language } from '../../i18n';
import { dateLabels } from '../../i18n/dates';
import { todayKey } from '../../lib/dates';
import { readCanvasTheme } from '../canvasTheme';
import { ClipView } from '../ClipView';

/**
 * Development only (/scenes.html): shows the engine's scenes one by one, in either
 * language. `scripts/media.mjs` opens it with ?capture&scene=…&lang=… and steps its clock
 * frame by frame to make the README's animations (`npm run media`). The tour's search and
 * floating diary aren't here: part of them is HTML, which the canvas doesn't draw.
 */

type SceneId = FeatureScene | 'tools' | 'desk';

const SCENES: SceneId[] = ['draw', 'turn', 'tasks', 'style', 'cover', 'private', 'tools', 'desk'];

const clipFor = (id: SceneId, c: TourSceneContext): Clip =>
  id === 'tools' || id === 'desk' ? tourClip(id, c) : featureClip(id, c);

/** The stage's size, in CSS pixels (the capture doubles it for sharp screens). */
const WIDTH = 800;
const HEIGHT = 450;

/** The app's texts (the scenes', the book's and the dates') in that language. */
function contextFor(language: Language): TourSceneContext {
  setLanguage(language);
  setTextDates(dateLabels());
  const texts = t();
  return {
    texts: texts.tour.scenes,
    style: DEFAULT_BOOK_STYLE,
    labels: texts.book,
    language,
    today: todayKey(),
  };
}

const params = new URLSearchParams(location.search);
const capture = params.has('capture');

declare global {
  interface Window {
    /** Set when the scene is on screen: how long it lasts (for scripts/media.mjs). */
    __scene?: { duration: number };
  }
}

function Recorder() {
  const [scene, setScene] = useState<SceneId>((params.get('scene') as SceneId) ?? 'draw');
  const [language, setLanguageState] = useState<Language>((params.get('lang') as Language) ?? 'en');
  const [ready, setReady] = useState(false);

  // The texts are laid out with their font: it must be there first.
  useEffect(() => {
    void fonts.load('caveat').then(() => setReady(true));
  }, []);

  const clip = useMemo(() => clipFor(scene, contextFor(language)), [scene, language]);
  const theme = useMemo(() => readCanvasTheme('light'), []);

  useEffect(() => {
    if (ready) window.__scene = { duration: clip.duration };
  }, [ready, clip]);

  return (
    <main style={{ padding: capture ? 0 : 24, fontFamily: 'var(--font)', color: 'var(--text)' }}>
      {!capture && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <select value={scene} onChange={(e) => setScene(e.target.value as SceneId)}>
            {SCENES.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
          <select value={language} onChange={(e) => setLanguageState(e.target.value as Language)}>
            {Object.entries(LANGUAGES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div id="stage" style={{ position: 'relative', width: WIDTH, height: HEIGHT }}>
        {ready && (
          <ClipView
            key={`${scene}-${language}`}
            clip={clip}
            theme={theme}
            loop={capture ? undefined : 1500}
            className="recorder-stage"
          />
        )}
      </div>
      <style>{`
        body { margin: 0; background: var(--canvas-bg); }
        .recorder-stage, .recorder-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      `}</style>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Recorder />);
