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
}

/** The unlocked keys, while the account is signed in (sync uses them). */
let keys: DiaryKeys | null = null;
export const currentKeys = () => keys;

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
  await vaults().update(vault.id, toData(recovered.vault), { requestKey: null });
  await keep(account, recovered.keys);
}

/** Changes the diary password. */
export async function changeVaultPassword(current: string, next: string) {
  const vault = await existingVault();
  const changed = await changePassword(vault, current, next);
  await vaults().update(vault.id, toData(changed), { requestKey: null });
}

/** Makes a new recovery code (the old one stops working). Returns it, to show it once. */
export async function replaceRecoveryCode(password: string): Promise<string> {
  const vault = await existingVault();
  const made = await newRecoveryCode(vault, password);
  await vaults().update(vault.id, toData(made.vault), { requestKey: null });
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
