import { lockNow } from '../cloud/lock';
import { hideDesktop } from '../desktop/bridge';
import { isDesktop } from '../desktop/tauri';
import { useUI } from '../store/ui';

/**
 * Locks the diary now, once what is pending is saved. On the desktop it is put away
 * first: the password is asked for when it is opened again, not now.
 */
export async function lockDiaryNow() {
  await useUI
    .getState()
    .diary?.flush()
    .catch(() => undefined);
  if (isDesktop()) await hideDesktop().catch(() => undefined);
  lockNow();
}
