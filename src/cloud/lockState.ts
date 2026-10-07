import { create } from 'zustand';
import { asRecord, readJSON, writeJSON } from '../lib/saved';
import type { VaultData } from './crypto';

/**
 * The diary encrypted on this device (docs/privacy.md): what is kept, and what is only in
 * memory while it is unlocked. The actions are in lock.ts; the cloud's vault (vault.ts)
 * reads this too, because the device and the cloud share the diary password.
 */

/** What this device keeps (in the clear: there are only wrapped keys in it). */
export interface LockRecord {
  /**
   * The diary's vault: the cloud's one (a copy, to open without a connection) or, without
   * an account, this device's own, which goes to the cloud when it is set up.
   */
  vault: VaultData;
  /** The cloud's version of that vault (0 for the device's own). */
  version: number;
  /** The account whose vault it is (null: the device's own). */
  account: string | null;
  /** The key that encrypts the diary here, wrapped with the diary secret. */
  deviceKey: string;
  /** Encrypting or decrypting the whole diary was cut halfway: it goes on when unlocking. */
  rewriting?: 'seal' | 'open';
}

export const LOCK_KEY = 'diaryo:lock';

export function readLock(): LockRecord | null {
  const record = asRecord(readJSON(LOCK_KEY));
  const vault = asRecord(record.vault);
  const ok =
    typeof record.deviceKey === 'string' &&
    typeof vault.wrappedKey === 'string' &&
    typeof vault.check === 'string' &&
    typeof record.version === 'number' &&
    (record.account === null || typeof record.account === 'string');
  if (!ok) return null;
  const rewriting = record.rewriting === 'seal' || record.rewriting === 'open';
  return {
    vault: record.vault as VaultData,
    version: record.version as number,
    account: record.account as string | null,
    deviceKey: record.deviceKey as string,
    ...(rewriting ? { rewriting: record.rewriting as 'seal' | 'open' } : {}),
  };
}

export function writeLock(record: LockRecord | null) {
  if (record) {
    if (!writeJSON(LOCK_KEY, record)) throw new Error("couldn't save the lock");
  } else {
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // Without storage there was nothing saved either.
    }
  }
}

/**
 * Off (the diary isn't encrypted here), locked (the password is needed) or unlocked.
 * `progress` is the share done while encrypting or decrypting the whole diary.
 */
export type LockStatus = 'off' | 'locked' | 'unlocked';

export const useLock = create<{ status: LockStatus; progress: number | null }>(() => ({
  status: readLock() ? 'locked' : 'off',
  progress: null,
}));

/** The diary secret, only in memory while unlocked. */
let secret: Uint8Array<ArrayBuffer> | null = null;
export const unlockedSecret = () => secret;
export const setUnlockedSecret = (next: Uint8Array<ArrayBuffer> | null) => {
  secret = next;
};
