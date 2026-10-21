import type { FeatureScene } from '@app/diary/featureScenes';
import { useEffect, useState, type ComponentType } from 'react';
import type { Lang } from '../i18n';
import './scene.css';

interface Props {
  scene: FeatureScene;
  lang: Lang;
}

/**
 * Loads a feature's scene (the engine comes with it, the first time) once the page gets
 * near it: `client:visible` in Features.astro, which watches the empty box drawn meanwhile
 * (until then the card shows its desk).
 */
export default function SceneIsland(props: Props) {
  const [Scene, setScene] = useState<ComponentType<Props> | null>(null);

  useEffect(() => {
    void import('./Scene').then((module) => setScene(() => module.default));
  }, []);

  return Scene ? <Scene {...props} /> : <div className="feature-scene" />;
}
