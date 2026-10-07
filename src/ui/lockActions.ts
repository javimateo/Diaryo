import { lockNow } from '../cloud/lock';
import { useUI } from '../store/ui';

/** Locks the diary now, once what is pending is saved. */
export async function lockDiaryNow() {
  await useUI
    .getState()
    .diary?.flush()
    .catch(() => undefined);
  lockNow();
}
