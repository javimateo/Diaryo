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
 * Desktop app: keeps the desktop side's reminders up to date (as the agenda, the settings
 * and the lock change), tells those missed while diaryo was closed and opens what a
 * clicked reminder is about.
 */
export function startReminders(): () => void {
  let loaded = false;
  const now = () => Date.now();
  const send = () => {
    const { agenda, settings, diaryState } = useUI.getState();
    const hidden = useLock.getState().status === 'locked';
    const list = settings.reminders
      ? buildReminders(agenda, now(), settings.remindBefore, hidden, diaryState.pages)
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
      const hidden = useLock.getState().status === 'locked';
      const missed =
        reminders && from > 0
          ? missedReminder(state.agenda, from, now(), remindBefore, hidden)
          : null;
      if (missed) void call('show_reminder', { reminder: missed }).catch(() => undefined);
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
    if (state.status !== before.status) send();
  });
  const timer = window.setInterval(seen, 60_000);
  const stopListening = listen<Reminder>(OPENED, (reminder) => {
    if (reminder.pageId && reminder.elementId) {
      void revealElement(reminder.pageId, reminder.elementId);
    } else useUI.getState().setDiaryOpen(true, 'tasks', 'top');
  });
  return () => {
    stopUI();
    stopLock();
    window.clearInterval(timer);
    void stopListening.then((stop) => stop());
  };
}
