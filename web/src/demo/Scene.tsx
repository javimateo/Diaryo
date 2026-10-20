import { featureClip, type FeatureScene } from '@app/diary/featureScenes';
import { DEFAULT_BOOK_STYLE } from '@app/engine/book';
import { fonts } from '@app/engine/fonts';
import type { ThemeMode } from '@app/engine/palette';
import { setTextDates } from '@app/engine/text';
import { setLanguage, t as appTexts } from '@app/i18n';
import { dateLabels } from '@app/i18n/dates';
import { todayKey } from '@app/lib/dates';
import { ClipView } from '@app/ui/ClipView';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { siteTheme, THEMES } from './themes';

interface Props {
  scene: FeatureScene;
  lang: Lang;
}

/** The pause between one play and the next. */
const LOOP_PAUSE = 2600;

/**
 * A feature drawn by the app's engine (the scenes of `featureScenes.ts`, on the default
 * book): in a loop, only while it is in view, light or dark like the website.
 */
export default function Scene({ scene, lang }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(siteTheme);

  const clip = useMemo(() => {
    // The app's texts (the book's, the scenes' and the dates') in the page's language.
    setLanguage(lang);
    setTextDates(dateLabels());
    const t = appTexts();
    const context = {
      texts: t.tour.scenes,
      style: DEFAULT_BOOK_STYLE,
      labels: t.book,
      language: lang,
      today: todayKey(),
    };
    return featureClip(scene, context);
  }, [scene, lang]);

  // The texts are laid out with their font: it must be there first.
  useEffect(() => {
    void fonts.load('caveat').then(() => setReady(true));
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(siteTheme()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="feature-scene">
      {ready && (
        <ClipView
          className="feature-scene-canvas"
          clip={clip}
          theme={THEMES[theme]}
          loop={LOOP_PAUSE}
          playing={visible}
        />
      )}
    </div>
  );
}
