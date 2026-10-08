import { useAccount } from '../cloud/account';
import { hideNotes, showAlso, type Notes } from '../cloud/lock';
import { handlePrivacy, useLock } from '../cloud/lockState';
import type { Diary } from '../diary/diary';
import { t } from '../i18n';
import { useUI } from '../store/ui';

/**
 * Asks for the diary password to show these private notes (each one on its own), or all
 * of them. Without a password on this device nor a cloud diary, one is set first.
 */
export function askToReveal(notes: Notes, then?: () => void) {
  const { account, vault } = useAccount.getState();
  const cloud = !!account && (vault === 'locked' || vault === 'unlocked');
  const none = useLock.getState().level === 'off' && !cloud;
  useUI.getState().setLockDialog({ view: none ? 'private' : 'reveal', notes, then });
}

/**
 * Marks these notes as private. Writing them needs the private key: with it here (other
 * notes are shown) they stay shown; otherwise the password is asked for first.
 */
export async function markPrivate(ids: string[]) {
  const mark = () => useUI.getState().engine?.setPrivate(ids, true);
  if (ids.length === 0) return;
  if (await showAlso(ids)) mark();
  else askToReveal(ids, mark);
}

/**
 * The diary's window: showing or hiding private notes keeps what is being written, saves
 * what is pending and then loads the page and the desk again. Each note shown hides
 * again by itself as the settings say (some minutes after it was shown), and all of them
 * when the window is minimized, if the settings say so.
 */
export function startPrivacy(diary: Diary): () => void {
  handlePrivacy(async (apply) => {
    useUI.getState().engine?.finishEditing(false);
    await diary.flush();
    apply();
    await diary.reloadShown();
  });

  const timers = new Map<string, number>();
  const clear = (id: string) => {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const schedule = (restart = false) => {
    const after = useUI.getState().settings.hidePrivate;
    const { shown } = useLock.getState();
    for (const id of [...timers.keys()]) if (restart || !shown.includes(id)) clear(id);
    if (after === 'minimize') return;
    for (const id of shown) {
      if (timers.has(id)) continue;
      timers.set(
        id,
        window.setTimeout(() => void hideNotes([id]), after * 60 * 1000),
      );
    }
  };
  const stopLock = useLock.subscribe((state, previous) => {
    if (state.shown === previous.shown) return;
    schedule();
    if (previous.revealed && !state.revealed) useUI.getState().showToast(t().lock.hidden);
  });
  const stopSettings = useUI.subscribe((state, previous) => {
    if (state.settings.hidePrivate !== previous.settings.hidePrivate) schedule(true);
  });
  const onVisibility = () => {
    const minimize = useUI.getState().settings.hidePrivate === 'minimize';
    if (document.hidden && minimize && useLock.getState().revealed) void hideNotes('all');
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    handlePrivacy(null);
    [...timers.keys()].forEach(clear);
    stopLock();
    stopSettings();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
