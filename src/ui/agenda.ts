import { agendaItems } from '../diary/agenda';
import { getLanguage } from '../i18n';
import { todayKey } from '../lib/dates';
import { DESK_ID } from '../storage/db';
import { useUI } from '../store/ui';

/** After a change, how long it waits for more before reading the diary again. */
const SETTLE = 1500;

let timer = 0;

/**
 * Reads the diary's dated lines again ("Próximo", the calendar's marks, the reminders),
 * soon or, with `delay`, once the changes settle.
 */
export function refreshAgenda(delay = 0) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void load(), delay);
}

async function load() {
  const { diary } = useUI.getState();
  if (!diary) return;
  try {
    const texts = await diary.texts();
    // Of the pages that exist (and the desk).
    const { diaryState } = useUI.getState();
    const pages = new Set([DESK_ID, ...diaryState.pages.map((page) => page.id)]);
    if (diaryState.current) pages.add(diaryState.current.id);
    const shown = texts.filter((entry) => pages.has(entry.pageId));
    useUI.getState().setAgenda(agendaItems(shown, todayKey(), getLanguage() === 'en'));
  } catch {
    // Locked meanwhile: it is read again when it opens (the pages change).
  }
}

/**
 * Keeps the agenda up to date: when the diary opens, after saving, when pages come and go
 * and when changes arrive from elsewhere (`DiaryHooks.onChangedElsewhere` calls it).
 */
export function startAgenda(): () => void {
  refreshAgenda();
  const stop = useUI.subscribe((state, before) => {
    if (state.saveStatus === 'saved' && before.saveStatus !== 'saved') refreshAgenda(SETTLE);
    if (state.diaryState.pages !== before.diaryState.pages) refreshAgenda(SETTLE);
  });
  return () => {
    stop();
    window.clearTimeout(timer);
  };
}
