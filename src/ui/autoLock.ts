import { useLock } from '../cloud/lockState';
import { isDesktop, listen } from '../desktop/tauri';
import { useUI } from '../store/ui';
import { lockDiaryNow } from './lockActions';

/** What counts as using the diary (to know how long it has been unused). */
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

/**
 * With the whole diary encrypted, it locks by itself as the settings say: after some
 * minutes without using it, and when it is put away (another tab, minimized, or to the
 * tray on the desktop). Returns how to stop.
 */
export function startAutoLock(): () => void {
  const active = () => useLock.getState().status === 'unlocked';
  let timer = 0;
  let last = 0;
  const lock = () => {
    if (active()) void lockDiaryNow();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    const minutes = useUI.getState().settings.autoLock;
    if (minutes > 0 && active()) timer = window.setTimeout(lock, minutes * 60 * 1000);
  };
  // Using it starts the count again (not on every mouse move: once a second is enough).
  const onActivity = () => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    schedule();
  };
  const away = () => {
    if (useUI.getState().settings.lockAway) lock();
  };
  const onVisibility = () => {
    if (document.hidden) away();
  };

  schedule();
  ACTIVITY.forEach((type) => window.addEventListener(type, onActivity, { passive: true }));
  document.addEventListener('visibilitychange', onVisibility);
  const stopSettings = useUI.subscribe((state, previous) => {
    if (state.settings.autoLock !== previous.settings.autoLock) schedule();
  });
  const stopLock = useLock.subscribe((state, previous) => {
    if (state.status !== previous.status) schedule();
  });
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
    window.clearTimeout(timer);
    ACTIVITY.forEach((type) => window.removeEventListener(type, onActivity));
    document.removeEventListener('visibilitychange', onVisibility);
    stopSettings();
    stopLock();
  };
}
