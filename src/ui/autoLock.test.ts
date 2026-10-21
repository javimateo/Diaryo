import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/testBrowser';

// The page's events and timers, without a browser.
const noop = () => {};
vi.stubGlobal('window', {
  addEventListener: noop,
  removeEventListener: noop,
  setTimeout: () => 0,
  clearTimeout: noop,
});
Object.assign(document, { addEventListener: noop, removeEventListener: noop });

/** Who listens to the desktop telling the diary was put away. */
let hidden: () => void = noop;
vi.mock('../desktop/tauri', () => ({
  isDesktop: () => true,
  listen: vi.fn((_: string, callback: () => void) => {
    hidden = callback;
    return Promise.resolve(noop);
  }),
}));
vi.mock('./lockActions', () => ({ lockDiaryNow: vi.fn(() => Promise.resolve()) }));

import { useAccount } from '../cloud/account';
import { useLock } from '../cloud/lockState';
import { useUI } from '../store/ui';
import { startAutoLock } from './autoLock';
import { lockDiaryNow } from './lockActions';

beforeEach(async () => {
  vi.mocked(lockDiaryNow).mockClear();
  useLock.setState({ status: 'unlocked', level: 'all' });
  useUI.setState({ settings: { ...useUI.getState().settings, lockAway: true, autoLock: 0 } });
  startAutoLock();
  await Promise.resolve();
});

describe('locking when the diary is put away', () => {
  it('locks it', () => {
    useAccount.setState({ googlePending: false });
    hidden();
    expect(lockDiaryNow).toHaveBeenCalled();
  });

  it('not while Google is open in the browser (locking would lose the sign-in)', () => {
    useAccount.setState({ googlePending: true });
    hidden();
    expect(lockDiaryNow).not.toHaveBeenCalled();
    useAccount.setState({ googlePending: false });
    hidden();
    expect(lockDiaryNow).toHaveBeenCalled();
  });
});
