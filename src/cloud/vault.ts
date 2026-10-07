import { ClientResponseError } from 'pocketbase';
import { useAccount } from './account';
import { pb } from './client';
import {
  changePassword,
  createVault,
  keysMatch,
  newRecoveryCode,
  recoverWithCode,
  unlockWithPassword,
  type DiaryKeys,
  type VaultData,
} from './crypto';
import { forgetKeys, loadKeys, saveKeys } from './keystore';

/**
 * The account's vault (the wrapped diary key, see docs/cloud.md) and this device's
 * keys: whether the cloud diary is set up and unlocked here.
 */

interface VaultRecord extends VaultData {
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

async function fetchVault(): Promise<VaultRecord | null> {
  const page = await vaults().getList<VaultRecord>(1, 1, { requestKey: null });
  return page.items[0] ?? null;
}

const toData = ({ kdf, wrappedKey, recoveryKey, check }: VaultData): VaultData => ({
  kdf,
  wrappedKey,
  recoveryKey,
  check,
});

/** Saves a change made from `vault` (refused if it changed meanwhile). */
async function save(vault: VaultRecord, next: VaultData) {
  try {
    await vaults().update(
      vault.id,
      { ...toData(next), version: (vault.version ?? 0) + 1 },
      { requestKey: null },
    );
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 409) throw new VaultChangedError();
    throw error;
  }
}

async function keep(account: string, next: DiaryKeys) {
  keys = next;
  await saveKeys(account, next);
  setVault('unlocked');
}

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
  const kept = await loadKeys(account).catch(() => null);
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
  if (kept && (await keysMatch(vault, kept))) return;
  keys = null;
  if (kept) await forgetKeys().catch(() => undefined);
  setVault('locked');
}

/** The first device: creates the vault. Returns the recovery code (to show it once). */
export async function setUpVault(password: string): Promise<string> {
  const account = accountId();
  if (!account) throw new Error('not signed in');
  const created = await createVault(password);
  try {
    await vaults().create({ user: account, ...created.vault }, { requestKey: null });
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

/** Unlocks this device with the diary password. */
export async function unlock(password: string) {
  const account = accountId()!;
  const opened = await unlockWithPassword(await existingVault(), password);
  await keep(account, opened);
}

/** Unlocks with the recovery code and sets a new diary password. */
export async function recover(code: string, newPassword: string) {
  const account = accountId()!;
  const vault = await existingVault();
  const recovered = await recoverWithCode(vault, code, newPassword);
  await save(vault, recovered.vault);
  await keep(account, recovered.keys);
}

/** Changes the diary password. */
export async function changeVaultPassword(current: string, next: string) {
  const vault = await existingVault();
  const changed = await changePassword(vault, current, next);
  await save(vault, changed);
}

/** Makes a new recovery code (the old one stops working). Returns it, to show it once. */
export async function replaceRecoveryCode(password: string): Promise<string> {
  const vault = await existingVault();
  const made = await newRecoveryCode(vault, password);
  await save(vault, made.vault);
  return made.recoveryCode;
}

// Signing in or out: the vault is found out again; signing out forgets the keys.
useAccount.subscribe((state, previous) => {
  if (state.account?.id === previous.account?.id) return;
  if (!state.account) {
    keys = null;
    void forgetKeys().catch(() => undefined);
  }
  void checkVault();
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
