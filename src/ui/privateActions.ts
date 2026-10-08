import { useAccount } from '../cloud/account';
import { hideNotes, showAlso, type Notes } from '../cloud/lock';
import { handlePrivacy, useLock } from '../cloud/lockState';
import { isDesktop, listen } from '../desktop/tauri';
import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
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
 * Deleting private notes asks for the diary password first; then `remove` runs (the
 * notes themselves, or the page they are on). Shown to check the password, they are
 * hidden again once gone, so the key doesn't stay for them.
 */
export function askToDelete(notes: readonly string[], remove: () => void) {
  useUI.getState().setLockDialog({
    view: 'delete',
    notes,
    then: () => {
      remove();
      void hideNotes(notes);
    },
  });
}

/**
 * Deleting these elements (`notes` are the private ones) asks for the diary password first.
 */
export const deletePrivate = (ids: string[], notes: readonly string[] = ids) =>
  askToDelete(notes, () => useUI.getState().engine?.deleteElements(ids));

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
 * Each private note shown hides again by itself some seconds after it was shown, as the
 * settings say; while it is being edited, it waits. Both the diary's window and the desk's
 * run it (the desk is always visible, so its timers aren't slowed down).
 */
export function startPrivacyTimers(engine: Engine): () => void {
  const timers = new Map<string, number>();
  let editing: string | null = null;
  const clear = (id: string) => {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const schedule = (restart = false) => {
    const after = useUI.getState().settings.hidePrivate;
    const { shown } = useLock.getState();
    for (const id of [...timers.keys()]) {
      if (restart || !shown.includes(id) || id === editing) clear(id);
    }
    for (const id of shown) {
      if (timers.has(id) || id === editing) continue;
      timers.set(
        id,
        window.setTimeout(() => void hideNotes([id]), after * 1000),
      );
    }
  };
  const stopLock = useLock.subscribe((state, previous) => {
    if (state.shown !== previous.shown) schedule();
  });
  const stopSettings = useUI.subscribe((state, previous) => {
    if (state.settings.hidePrivate !== previous.settings.hidePrivate) schedule(true);
  });
  // Writing in a note shown stops its countdown; it starts again when the writing ends.
  const stopEditing = engine.subscribeEditing((state) => {
    const id = state?.element.id ?? null;
    if (id === editing) return;
    const ended = editing;
    editing = id;
    if (ended) clear(ended);
    schedule();
  });
  return () => {
    [...timers.keys()].forEach(clear);
    stopLock();
    stopSettings();
    stopEditing();
  };
}

/**
 * The diary's window: showing or hiding private notes keeps what is being written, saves
 * what is pending and then loads the page and the desk again. Besides each note's timer,
 * all of them hide when the diary is put away (minimized, another tab, or to the tray),
 * if the settings say so.
 */
export function startPrivacy(diary: Diary, engine: Engine): () => void {
  handlePrivacy(async (apply) => {
    engine.finishEditing(false);
    await diary.flush();
    apply();
    await diary.reloadShown();
  });
  const stopTimers = startPrivacyTimers(engine);
  const stopToast = useLock.subscribe((state, previous) => {
    if (previous.revealed && !state.revealed) useUI.getState().showToast(t().lock.hidden);
  });

  const away = () => {
    if (useUI.getState().settings.hidePrivateAway && useLock.getState().revealed) {
      void hideNotes('all');
    }
  };
  const onVisibility = () => {
    if (document.hidden) away();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // On the desktop, putting the diary away hides its window (it isn't minimized).
  let stopped = false;
  let unlisten: (() => void) | null = null;
  if (isDesktop()) {
    void listen('diaryo://hidden', away).then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    });
  }
  return () => {
    stopped = true;
    unlisten?.();
    handlePrivacy(null);
    stopTimers();
    stopToast();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
