import { useEffect } from 'react';
import { todayKey } from '../lib/dates';
import { completeDates, dateTone } from '../lib/when';
import { formatWhen } from '../i18n/dates';
import { getLanguage } from '../i18n';
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
      const today = todayKey();
      const language = getLanguage();
      const monthFirst = language === 'en';
      engine.setDates({
        today,
        monthFirst,
        label: (mark, task) => ({
          text: formatWhen(mark, today),
          tone: dateTone(mark, task, now),
        }),
        complete: (text) => completeDates(text, today, language, monthFirst),
      });
      // At the start of the next minute.
      timer = window.setTimeout(update, 60_000 - (now % 60_000) + 50);
    };
    update();
    return () => window.clearTimeout(timer);
  }, [engine, language]);
}
