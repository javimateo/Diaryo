import { useEffect, useState, type ComponentType } from 'react';
import type { Lang } from '../i18n';

interface Props {
  lang: Lang;
}

/** Computers: a wide screen and a mouse. The same query as `client:media` in Home.astro. */
export const DESKTOP = '(min-width: 961px) and (pointer: fine)';

/**
 * Loads the live demo (the engine is heavy) and shows it only while the screen is a
 * computer's: on a phone the page keeps the still picture and downloads nothing.
 */
export default function DemoIsland({ lang }: Props) {
  const [Demo, setDemo] = useState<ComponentType<Props> | null>(null);
  // Rendered on the server too (nothing there): the screen is only known in the browser.
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = matchMedia(DESKTOP);
    const onChange = () => setDesktop(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (desktop && !Demo) void import('./Demo').then((module) => setDemo(() => module.default));
  }, [desktop, Demo]);

  return desktop && Demo ? <Demo lang={lang} /> : null;
}
