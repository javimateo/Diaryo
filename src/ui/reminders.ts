import { useLock } from '../cloud/lockState';
import { call, listen } from '../desktop/tauri';
import { buildReminders, missedReminder, type Reminder } from '../diary/reminders';
import { readText, writeText } from '../lib/saved';
import { useUI } from '../store/ui';
import { revealElement } from './diaryActions';

/** A reminder was clicked: the floating diary is already shown. */
const OPENED = 'diaryo://reminder-opened';
/** Until when the reminders were looked after (to tell those missed while closed). */
const SEEN_KEY = 'diaryo:reminders-seen';
/**
 * Something written right at its time (or saved a moment after) arrives once its reminder
 * is due: up to this late, it still reminds, at once.
 */
const LATE = 5 * 60_000;

/**
 * Without their words with the whole diary encrypted: Windows keeps the notifications it
 * showed (its notification centre, on disk), and the diary is meant not to be readable
 * there.
 */
const withoutWords = () => useLock.getState().level === 'all';

/**
 * Desktop app: keeps the desktop side's reminders up to date (as the agenda, the settings
 * and the lock change), tells those missed while diaryo was closed and opens what a
 * clicked reminder is about.
 */
export function startReminders(): () => void {
  let loaded = false;
  // When the list was last sent: what came due since then wasn't in it yet.
  let sentAt = 0;
  const now = () => Date.now();
  const send = () => {
    const { agenda, settings, diaryState } = useUI.getState();
    const hidden = withoutWords();
    const time = now();
    const since = Math.max(sentAt, time - LATE);
    sentAt = time;
    const list = settings.reminders
      ? buildReminders(agenda, time, settings.remindBefore, hidden, diaryState.pages, since)
      : [];
    void call('set_reminders', { reminders: list }).catch(() => undefined);
  };
  // Until when they were looked after: while the diary is read, every minute.
  const seen = () => {
    if (loaded) writeText(SEEN_KEY, String(now()));
  };

  const stopUI = useUI.subscribe((state, before) => {
    if (state.agenda !== before.agenda && !loaded) {
      // The first time the diary is read: what was missed while diaryo was closed.
      loaded = true;
      const from = Number(readText(SEEN_KEY));
      const { reminders, remindBefore } = state.settings;
      const hidden = withoutWords();
      const missed =
        reminders && from > 0
          ? missedReminder(state.agenda, from, now(), remindBefore, hidden)
          : null;
      if (missed) void call('show_reminder', { reminder: missed }).catch(() => undefined);
      // What was due until now is in that summary already.
      sentAt = now();
      seen();
    }
    if (
      state.agenda !== before.agenda ||
      state.settings.reminders !== before.settings.reminders ||
      state.settings.remindBefore !== before.settings.remindBefore ||
      state.settings.language !== before.settings.language
    ) {
      send();
    }
  });
  const stopLock = useLock.subscribe((state, before) => {
    if (state.level !== before.level) send();
  });
  const timer = window.setInterval(seen, 60_000);
  const stopListening = listen<Reminder>(OPENED, (reminder) => {
    if (reminder.pageId && reminder.elementId) {
      void revealElement(reminder.pageId, reminder.elementId);
    } else useUI.getState().setUpcomingOpen(true);
  });
  return () => {
    stopUI();
    stopLock();
    window.clearInterval(timer);
    void stopListening.then((stop) => stop());
  };
}
