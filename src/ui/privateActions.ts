import { useAccount } from '../cloud/account';
import { hidePrivate } from '../cloud/lock';
import { handlePrivacy, useLock } from '../cloud/lockState';
import type { Diary } from '../diary/diary';
import { t } from '../i18n';
import { useUI } from '../store/ui';

/**
 * Asks for the diary password to show the private notes. Without a password on this
 * device nor a cloud diary, one is set first.
 */
export function askToReveal(then?: () => void) {
  const { account, vault } = useAccount.getState();
  const cloud = !!account && (vault === 'locked' || vault === 'unlocked');
  const none = useLock.getState().level === 'off' && !cloud;
  useUI.getState().setLockDialog({ view: none ? 'private' : 'reveal', then });
}

/** Marks the selected notes as private: they need their key, so they must be shown. */
export function markSelectionPrivate() {
  const mark = () => useUI.getState().engine?.setPrivateSelection(true);
  if (useLock.getState().revealed) mark();
  else askToReveal(mark);
}

/**
 * The diary's window: showing or hiding the private notes saves what is pending first
 * and then loads the page and the desk again; they hide again by themselves as the
 * settings say (after some minutes, or when the window is minimized).
 */
export function startPrivacy(diary: Diary): () => void {
  handlePrivacy(async (apply) => {
    // A text being written is kept first (the page loads again afterwards).
    useUI.getState().engine?.finishEditing(false);
    await diary.flush();
    apply();
    await diary.reloadShown();
  });

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    const after = useUI.getState().settings.hidePrivate;
    if (!useLock.getState().revealed || after === 'minimize') return;
    timer = window.setTimeout(() => void hidePrivate(), after * 60 * 1000);
  };
  const stopLock = useLock.subscribe((state, previous) => {
    if (state.revealed === previous.revealed) return;
    schedule();
    if (!state.revealed) useUI.getState().showToast(t().lock.hidden);
  });
  const stopSettings = useUI.subscribe((state, previous) => {
    if (state.settings.hidePrivate !== previous.settings.hidePrivate) schedule();
  });
  const onVisibility = () => {
    const minimize = useUI.getState().settings.hidePrivate === 'minimize';
    if (document.hidden && minimize && useLock.getState().revealed) void hidePrivate();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    handlePrivacy(null);
    window.clearTimeout(timer);
    stopLock();
    stopSettings();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
