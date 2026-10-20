import { useEffect } from 'react';
import { dateLabels } from '../i18n/dates';
import { useUI } from '../store/ui';

/**
 * The dates of tasks and appointments drawn as labels ("mañana 10:00"), redrawn every
 * minute: "hoy" becomes "ayer" and a task turns late at its time.
 */
export function useDateLabels() {
  const engine = useUI((s) => s.engine);
  const language = useUI((s) => s.settings.language);

  useEffect(() => {
    if (!engine) return;
    let timer = 0;
    const update = () => {
      const now = Date.now();
      engine.setDates(dateLabels(now));
      // At the start of the next minute.
      timer = window.setTimeout(update, 60_000 - (now % 60_000) + 50);
    };
    update();
    return () => window.clearTimeout(timer);
  }, [engine, language]);
}
