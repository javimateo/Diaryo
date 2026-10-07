import { ClientResponseError } from 'pocketbase';
import { countPrivateNotes, getDB, reboxPrivateNotes } from '../storage/db';
import { useAccount } from './account';
import { pb } from './client';
import {
  changePassword,
  createVault,
  diaryKeys,
  keysMatch,
  newRecoveryCode,
  openSecret,
  privateKeyOf,
  recoverWithCode,
  unlockWithPassword,
  wrapDeviceKey,
  type DiaryKeys,
  type VaultData,
} from './crypto';
import { forgetKeys, loadKeys, saveKeys } from './keystore';
import {
  applyPrivateKey,
  readLock,
  sealedHere,
  setUnlockedSecret,
  unlockedSecret,
  writeLock,
} from './lockState';

/**
 * The account's vault (the wrapped diary key, see docs/cloud.md) and this device's
 * keys: whether the cloud diary is set up and unlocked here.
 */

export interface VaultRecord extends VaultData {
  id: string;
  /** Each change says the next one (see cloud/pb_hooks/main.pb.js). */
  version: number;
}

/** The unlocked keys, while the account is signed in (sync uses them). */
let keys: DiaryKeys | null = null;
export const currentKeys = () => keys;

/**
 * The vault changed on another device since it was read here (its password or recovery
 * code): this change wasn't made, so as not to undo that one.
 */
export class VaultChangedError extends Error {
  constructor() {
    super('the vault changed on another device');
  }
}

/** A vault was created on another device meanwhile: unlock that one instead. */
export class VaultExistsError extends Error {
  constructor() {
    super('the account already has a vault');
  }
}

const vaults = () => pb.collection('vaults');
const accountId = () => useAccount.getState().account?.id ?? null;
const setVault = (vault: ReturnType<typeof useAccount.getState>['vault']) =>
  useAccount.setState({ vault });

export async function fetchVault(): Promise<VaultRecord | null> {
  const page = await vaults().getList<VaultRecord>(1, 1, { requestKey: null });
  return page.items[0] ?? null;
}

const toData = ({ kdf, wrappedKey, recoveryKey, check }: VaultData): VaultData => ({
  kdf,
  wrappedKey,
  recoveryKey,
  check,
});

/** Saves a change made from `vault` (refused if it changed meanwhile). Returns it saved. */
async function save(vault: VaultRecord, next: VaultData): Promise<VaultRecord> {
  const version = (vault.version ?? 0) + 1;
  try {
    await vaults().update(vault.id, { ...toData(next), version }, { requestKey: null });
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 409) throw new VaultChangedError();
    throw error;
  }
  return { ...vault, ...toData(next), version };
}

/**
 * With the whole diary encrypted on this device (lockState.ts), the keys aren't kept on
 * disk: they come from the diary password each time it is unlocked.
 */
async function keep(account: string, next: DiaryKeys) {
  keys = next;
  if (!sealedHere()) await saveKeys(account, next);
  setVault('unlocked');
}

/**
 * The private notes here are hidden and the account's diary has another password: they
 * must be shown first, so their text can go with the new one (see `follow`).
 */
export class PrivateHiddenError extends Error {
  constructor() {
    super('the private notes must be shown first');
  }
}

const sameSecret = async (vault: VaultData, secret: Uint8Array<ArrayBuffer>) =>
  keysMatch(vault, await diaryKeys(secret));

async function canFollow(secret: Uint8Array<ArrayBuffer>) {
  const lock = readLock();
  if (!lock || unlockedSecret() || (await sameSecret(lock.vault, secret))) return;
  if ((await countPrivateNotes(getDB())) > 0) throw new PrivateHiddenError();
}

/**
 * With the diary password set on this device, it follows the account's vault: the same
 * password opens both. A vault with another secret (the first time with an account that
 * had a diary already) wraps this device's key again, and the private notes' text goes
 * with the new secret. Returns whether the password changed here.
 */
async function follow(account: string, vault: VaultRecord, secret: Uint8Array<ArrayBuffer>) {
  const lock = readLock();
  if (!lock) return false;
  const db = getDB();
  const same = await sameSecret(lock.vault, secret);
  let deviceKey = lock.deviceKey;
  if (!same) {
    if (deviceKey && db.sealing.key) deviceKey = await wrapDeviceKey(secret, db.sealing.key);
    const old = unlockedSecret();
    if (old) await reboxPrivateNotes(db, await privateKeyOf(old), await privateKeyOf(secret));
  }
  writeLock({ ...lock, vault: toData(vault), version: vault.version ?? 0, account, deviceKey });
  setUnlockedSecret(secret);
  if (!same && db.sealing.privateKey) await applyPrivateKey(await privateKeyOf(secret));
  return !same;
}

/** The diary was unlocked on this device (lock.ts): its keys may be the cloud's too. */
export async function takeDeviceSecret(secret: Uint8Array<ArrayBuffer>) {
  keys = await diaryKeys(secret);
  if (accountId()) await checkVault();
}

/** The diary isn't encrypted here any more: the cloud's keys are kept on disk again. */
export async function keepKeysOnDevice() {
  const account = accountId();
  if (account && keys && useAccount.getState().vault === 'unlocked') {
    await saveKeys(account, keys);
  }
}

/** The diary was encrypted here: the cloud's keys leave the disk (they stay in memory). */
export const forgetKeptKeys = () => forgetKeys().catch(() => undefined);

/**
 * Finds out how the vault is on this device. Keys kept from before count as unlocked,
 * even without a connection; with one, they are checked against the vault (it could
 * have been made again).
 */
export async function checkVault() {
  const account = accountId();
  if (!account) {
    keys = null;
    return setVault('unknown');
  }
  const lock = readLock();
  const sealed = lock?.level === 'all';
  // The keys kept on disk or, from the diary password typed here, the ones in memory.
  const stored = sealed ? null : await loadKeys(account).catch(() => null);
  const kept = stored ?? keys;
  if (kept) {
    keys = kept;
    setVault('unlocked');
  }
  let vault: VaultRecord | null;
  try {
    vault = await fetchVault();
  } catch {
    return; // Without a connection, it stays as it was.
  }
  if (account !== accountId()) return;
  if (!vault) {
    keys = null;
    return setVault('none');
  }
  if (kept && (await keysMatch(vault, kept))) {
    if (!sealed && !stored) await saveKeys(account, kept).catch(() => undefined);
    // The password may have changed on another device: the copy here follows.
    const secret = unlockedSecret();
    if (lock && secret && (lock.account !== account || (vault.version ?? 0) > lock.version)) {
      await follow(account, vault, secret);
    }
    return;
  }
  keys = null;
  if (stored) await forgetKeys().catch(() => undefined);
  setVault('locked');
}

/**
 * This device has its own vault (the diary password set here without an account): it
 * goes to the cloud as it is, with the same password and recovery code.
 */
export const hasOwnVault = () => readLock()?.account === null;

/**
 * The first device: creates the vault. Returns the recovery code (to show it once), or
 * null when it is this device's own vault (opened with its password), whose code was
 * shown when it was made.
 */
export async function setUpVault(password: string): Promise<string | null> {
  const account = accountId();
  if (!account) throw new Error('not signed in');
  const lock = readLock();
  const own = lock?.account === null ? lock : null;
  const opened = own ? await openSecret(own.vault, password) : null;
  const created = own
    ? { vault: own.vault, keys: opened!.keys, recoveryCode: null }
    : await createVault(password);
  try {
    const record = await vaults().create<VaultRecord>(
      { user: account, ...created.vault },
      { requestKey: null },
    );
    if (opened) await follow(account, record, opened.secret);
  } catch (error) {
    // Unique per user: another device was quicker.
    if ((await fetchVault().catch(() => null)) !== null) {
      setVault('locked');
      throw new VaultExistsError();
    }
    throw error;
  }
  await keep(account, created.keys);
  return created.recoveryCode;
}

async function existingVault() {
  const vault = await fetchVault();
  if (!vault) {
    setVault('none');
    throw new Error('no vault');
  }
  return vault;
}

/**
 * Unlocks this device with the diary password. Returns whether, with the diary encrypted
 * here, its password became this account's.
 */
export async function unlock(password: string): Promise<boolean> {
  const account = accountId()!;
  const vault = await existingVault();
  const opened = await openSecret(vault, password);
  await canFollow(opened.secret);
  await keep(account, opened.keys);
  return follow(account, vault, opened.secret);
}

/** Unlocks with the recovery code and sets a new diary password (returns as `unlock`). */
export async function recover(code: string, newPassword: string): Promise<boolean> {
  const account = accountId()!;
  const vault = await existingVault();
  const recovered = await recoverWithCode(vault, code, newPassword);
  await canFollow(recovered.secret);
  const saved = await save(vault, recovered.vault);
  await keep(account, recovered.keys);
  return follow(account, saved, recovered.secret);
}

/** The copy of the vault on this device follows a change (with the diary encrypted here). */
async function followChange(saved: VaultRecord) {
  const account = accountId();
  const secret = unlockedSecret();
  if (account && secret) await follow(account, saved, secret);
}

/** Changes the diary password. */
export async function changeVaultPassword(current: string, next: string) {
  const vault = await existingVault();
  const changed = await changePassword(vault, current, next);
  await followChange(await save(vault, changed));
}

/** Makes a new recovery code (the old one stops working). Returns it, to show it once. */
export async function replaceRecoveryCode(password: string): Promise<string> {
  const vault = await existingVault();
  const made = await newRecoveryCode(vault, password);
  await followChange(await save(vault, made.vault));
  return made.recoveryCode;
}

// Signing in or out: the vault is found out again; signing out forgets the keys. With the
// diary encrypted here, signing in tries the keys of the diary secret unlocked here.
useAccount.subscribe((state, previous) => {
  if (state.account?.id === previous.account?.id) return;
  keys = null;
  if (!state.account) void forgetKeys().catch(() => undefined);
  const secret = sealedHere() ? unlockedSecret() : null;
  void (secret ? takeDeviceSecret(secret) : checkVault());
});

/**
 * Opens the vault for one sync without keeping the keys on this device (the "manual with
 * password" mode). The caller drops them afterwards.
 */
export async function unlockOnce(password: string): Promise<DiaryKeys> {
  return unlockWithPassword(await existingVault(), password);
}

/** This device stops keeping the keys (they will be asked for again). */
export async function forgetDevice() {
  keys = null;
  await forgetKeys().catch(() => undefined);
  if (useAccount.getState().vault === 'unlocked') setVault('locked');
}
