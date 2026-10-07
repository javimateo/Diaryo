import { create } from 'zustand';
import { asRecord, readJSON, writeJSON } from '../lib/saved';
import { getDB } from '../storage/db';
import type { VaultData } from './crypto';

/**
 * The diary password on this device (docs/privacy.md): what is kept, and what is only in
 * memory. The actions are in lock.ts; the cloud's vault (vault.ts) reads this too,
 * because the device and the cloud share the diary password.
 */

/**
 * What is encrypted on this device: only the private notes, or the whole diary (which
 * asks for the password when it opens). Without a record, nothing.
 */
export type LockLevel = 'private' | 'all';

/** What this device keeps (in the clear: there are only wrapped keys in it). */
export interface LockRecord {
  level: LockLevel;
  /**
   * The diary's vault: the cloud's one (a copy, to open without a connection) or, without
   * an account, this device's own, which goes to the cloud when it is set up.
   */
  vault: VaultData;
  /** The cloud's version of that vault (0 for the device's own). */
  version: number;
  /** The account whose vault it is (null: the device's own). */
  account: string | null;
  /** The key that encrypts the whole diary here, wrapped with the diary secret. */
  deviceKey: string | null;
  /** Encrypting or decrypting the whole diary was cut halfway: it goes on when unlocking. */
  rewriting?: 'seal' | 'open';
}

export const LOCK_KEY = 'diaryo:lock';

export function readLock(): LockRecord | null {
  const record = asRecord(readJSON(LOCK_KEY));
  const vault = asRecord(record.vault);
  // Records from before the private notes were always the whole diary.
  const level: LockLevel = record.level === 'private' ? 'private' : 'all';
  const deviceKey = typeof record.deviceKey === 'string' ? record.deviceKey : null;
  const ok =
    (deviceKey !== null || level === 'private') &&
    typeof vault.wrappedKey === 'string' &&
    typeof vault.check === 'string' &&
    typeof record.version === 'number' &&
    (record.account === null || typeof record.account === 'string');
  if (!ok) return null;
  const rewriting = record.rewriting === 'seal' || record.rewriting === 'open';
  return {
    level,
    vault: record.vault as VaultData,
    version: record.version as number,
    account: record.account as string | null,
    deviceKey,
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

/** The whole diary is encrypted here. */
export const sealedHere = () => readLock()?.level === 'all';

/**
 * - `status`: the whole diary is locked (the password is needed to open it), unlocked,
 *   or not encrypted (`off`, also with only the private notes).
 * - `level`: what is encrypted here.
 * - `revealed`: the private notes are shown.
 * - `progress`: the share done while encrypting or decrypting the whole diary.
 */
export type LockStatus = 'off' | 'locked' | 'unlocked';

interface LockState {
  status: LockStatus;
  level: LockLevel | 'off';
  revealed: boolean;
  progress: number | null;
}

export const useLock = create<LockState>(() => {
  const lock = readLock();
  return {
    status: lock?.level === 'all' ? 'locked' : 'off',
    level: lock?.level ?? 'off',
    revealed: false,
    progress: null,
  };
});

/** The diary secret, only in memory (while unlocked, or the private notes are shown). */
let secret: Uint8Array<ArrayBuffer> | null = null;
export const unlockedSecret = () => secret;
export const setUnlockedSecret = (next: Uint8Array<ArrayBuffer> | null) => {
  secret = next;
};

/**
 * How this window shows or hides the private notes: it saves what is pending, switches
 * the key (`apply`) and loads what shows again (the diary's window, or the desk's).
 */
export type PrivacyHandler = (apply: () => void) => Promise<void>;
let privacyHandler: PrivacyHandler | null = null;
export const handlePrivacy = (handler: PrivacyHandler | null) => {
  privacyHandler = handler;
};

/** Shows the private notes with their key, or hides them (null). */
export async function applyPrivateKey(key: Uint8Array | null) {
  const apply = () => {
    getDB().sealing.privateKey = key;
  };
  if (privacyHandler) await privacyHandler(apply);
  else apply();
  useLock.setState({ revealed: key !== null });
}
