import { getDB, rewriteDiary } from '../storage/db';
import { openSealed, serializeSealed, type SealedBackup } from '../storage/files';
import { newSealingKey } from '../storage/sealing';
import { useAccount } from './account';
import {
  changePassword,
  createVault,
  newRecoveryCode,
  openSecret,
  openSecretWithCode,
  PBKDF2_ITERATIONS,
  recoverWithCode,
  unwrapDeviceKey,
  wrapDeviceKey,
  WrongSecretError,
  type VaultData,
} from './crypto';
import {
  readLock,
  setUnlockedSecret,
  unlockedSecret,
  useLock,
  writeLock,
  type LockRecord,
} from './lockState';
import {
  fetchVault,
  forgetKeptKeys,
  keepKeysOnDevice,
  recover,
  takeDeviceSecret,
  type VaultRecord,
} from './vault';

/**
 * The diary encrypted on this device (docs/privacy.md). It uses the diary password and
 * recovery code, the same ones as the cloud: a key of its own encrypts the diary here
 * (storage/sealing.ts), wrapped with the diary secret, so changing the account or the
 * password never encrypts the diary again. The keys are only in memory, and the windows
 * of the app (tabs, the desk on the desktop) pass them to each other.
 */

const vaultData = ({ kdf, wrappedKey, recoveryKey, check }: VaultData): VaultData => ({
  kdf,
  wrappedKey,
  recoveryKey,
  check,
});

const accountId = () => useAccount.getState().account?.id ?? null;

/** Writes go encrypted unless the diary is being decrypted. */
function applyRecord(lock: LockRecord | null) {
  getDB().sealing.seal = !!lock && lock.rewriting !== 'open';
}

// ─── Between windows ────────────────────────────────────────────

type Message =
  /** A window that starts locked asks the others for the secret. */
  | { type: 'ask' }
  /** The diary secret, from an unlocked window. */
  | { type: 'secret'; secret: Uint8Array<ArrayBuffer> }
  /** The lock changed (turned on or off): it is read again. */
  | { type: 'changed'; secret: Uint8Array<ArrayBuffer> | null }
  /** Lock everything now. */
  | { type: 'lock' };

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('diaryo-lock');
const post = (message: Message) => channel?.postMessage(message);

function onMessage(message: Message) {
  const lock = readLock();
  if (message.type === 'ask') {
    const secret = unlockedSecret();
    if (secret && getDB().sealing.key) post({ type: 'secret', secret });
  } else if (message.type === 'secret') {
    if (lock && useLock.getState().status === 'locked') {
      void open(lock, message.secret, false).catch(() => undefined);
    }
  } else if (message.type === 'changed') {
    applyRecord(lock);
    if (!lock) {
      setUnlockedSecret(null);
      useLock.setState({ status: 'off' });
    } else if (message.secret) {
      void open(lock, message.secret, false).catch(() => undefined);
    }
  } else if (message.type === 'lock') {
    location.reload();
  }
}

/**
 * Before anything reads the diary: whether it is encrypted here. If it is, another window
 * already unlocked may pass the secret.
 */
export function startLock() {
  const lock = readLock();
  applyRecord(lock);
  useLock.setState({ status: lock ? 'locked' : 'off' });
  if (channel) channel.onmessage = (e: MessageEvent<Message>) => onMessage(e.data);
  if (lock) post({ type: 'ask' });
}

// ─── Unlocking ──────────────────────────────────────────────────

/**
 * Opens the diary with its secret: the device's key, and the cloud's keys if they are
 * the same diary's. A rewrite cut halfway goes on (only in the window the user unlocked).
 */
async function open(lock: LockRecord, secret: Uint8Array<ArrayBuffer>, resume: boolean) {
  getDB().sealing.key = await unwrapDeviceKey(secret, lock.deviceKey);
  setUnlockedSecret(secret);
  if (resume && lock.rewriting) await rewrite(lock.rewriting);
  useLock.setState({ status: readLock() ? 'unlocked' : 'off' });
  await takeDeviceSecret(secret).catch(() => undefined);
}

/** Unlocks with the diary password. */
export async function unlockDiary(password: string) {
  const lock = readLock();
  if (!lock) return;
  let secret: Uint8Array<ArrayBuffer>;
  try {
    ({ secret } = await openSecret(lock.vault, password));
  } catch (error) {
    // The password may have changed on another device while this one was offline.
    const newer = await newerCloudVault(lock);
    if (!(error instanceof WrongSecretError) || !newer) throw error;
    ({ secret } = await openSecret(newer, password));
    writeLock({ ...lock, vault: vaultData(newer), version: newer.version });
  }
  await open(lock, secret, true);
  post({ type: 'secret', secret });
}

async function newerCloudVault(lock: LockRecord): Promise<VaultRecord | null> {
  if (!lock.account || lock.account !== accountId()) return null;
  const vault = await fetchVault().catch(() => null);
  return vault && (vault.version ?? 0) > lock.version ? vault : null;
}

/**
 * Unlocks with the recovery code and sets a new password. With the account's vault, the
 * cloud's changes too (if there is a connection; otherwise only this device's copy).
 */
export async function recoverDiary(code: string, newPassword: string) {
  const lock = readLock();
  if (!lock) return;
  let recovered: Awaited<ReturnType<typeof recoverWithCode>>;
  let version = lock.version;
  try {
    recovered = await recoverWithCode(lock.vault, code, newPassword);
  } catch (error) {
    // A new code may have been made on another device while this one was offline.
    const newer = await newerCloudVault(lock);
    if (!(error instanceof WrongSecretError) || !newer) throw error;
    recovered = await recoverWithCode(newer, code, newPassword);
    version = newer.version;
  }
  writeLock({ ...lock, vault: vaultData(recovered.vault), version });
  await open(readLock()!, recovered.secret, true);
  post({ type: 'secret', secret: recovered.secret });
  if (lock.account && lock.account === accountId()) {
    await recover(code, newPassword).catch((error) =>
      console.error("Couldn't change the cloud's diary password", error),
    );
  }
}

// ─── Turning it on and off ──────────────────────────────────────

/** Encrypts or decrypts the whole diary, showing how far it got. */
async function rewrite(mode: 'seal' | 'open') {
  const db = getDB();
  useLock.setState({ progress: 0 });
  try {
    await rewriteDiary(db, (done, total) => useLock.setState({ progress: done / total }));
  } finally {
    useLock.setState({ progress: null });
  }
  const lock = readLock();
  if (mode === 'open') {
    writeLock(null);
    db.sealing.key = null;
    setUnlockedSecret(null);
    useLock.setState({ status: 'off' });
    await keepKeysOnDevice();
  } else if (lock) {
    writeLock({ ...lock, rewriting: undefined });
  }
  post({ type: 'changed', secret: null });
}

/**
 * Encrypts the diary on this device. Signed in with a cloud diary, with its password (no
 * new recovery code); otherwise, a new diary password, and returns its recovery code to
 * show it once.
 */
export async function enableLock(password: string): Promise<string | null> {
  const account = accountId();
  const cloud = account ? await fetchVault() : null;
  let lock: Omit<LockRecord, 'deviceKey'>;
  let secret: Uint8Array<ArrayBuffer>;
  let code: string | null = null;
  if (cloud) {
    ({ secret } = await openSecret(cloud, password));
    lock = { vault: vaultData(cloud), version: cloud.version ?? 0, account };
  } else {
    secret = newSealingKey();
    const created = await createVault(password, PBKDF2_ITERATIONS, secret);
    lock = { vault: created.vault, version: 0, account: null };
    code = created.recoveryCode;
  }
  const key = newSealingKey();
  writeLock({ ...lock, deviceKey: await wrapDeviceKey(secret, key), rewriting: 'seal' });
  const db = getDB();
  db.sealing.key = key;
  setUnlockedSecret(secret);
  applyRecord(readLock());
  useLock.setState({ status: 'unlocked' });
  post({ type: 'changed', secret });
  await forgetKeptKeys();
  await takeDeviceSecret(secret).catch(() => undefined);
  await rewrite('seal');
  return code;
}

/** Decrypts the diary on this device (asks for the password, to be sure). */
export async function disableLock(password: string) {
  const lock = readLock();
  if (!lock) return;
  await openSecret(lock.vault, password);
  writeLock({ ...lock, rewriting: 'open' });
  applyRecord(readLock());
  post({ type: 'changed', secret: null });
  await rewrite('open');
}

/**
 * The diary left this device (signing out and removing it): the blank one that stays
 * isn't encrypted.
 */
export async function dropLock() {
  if (!readLock()) return;
  const db = getDB();
  db.sealing.seal = false;
  await rewriteDiary(db);
  writeLock(null);
  db.sealing.key = null;
  setUnlockedSecret(null);
  useLock.setState({ status: 'off' });
  post({ type: 'changed', secret: null });
}

/**
 * Without the password nor the recovery code: the diary leaves this device (it can't be
 * opened anyway) and the app starts again with a new one.
 */
export async function eraseDiary() {
  await getDB().delete();
  writeLock(null);
  await forgetKeptKeys();
  post({ type: 'lock' });
  location.reload();
}

/** Locks every window now: they start again, locked (nothing stays in memory). */
export function lockNow() {
  post({ type: 'lock' });
  location.reload();
}

// ─── The password, without an account ───────────────────────────
// (With the account's vault, the cloud's ones change both: vault.ts.)

export async function changeLockPassword(current: string, next: string) {
  const lock = readLock();
  if (!lock) return;
  writeLock({ ...lock, vault: await changePassword(lock.vault, current, next) });
}

export async function newLockRecoveryCode(password: string): Promise<string> {
  const lock = readLock();
  if (!lock) throw new Error('the diary is not encrypted');
  const made = await newRecoveryCode(lock.vault, password);
  writeLock({ ...lock, vault: made.vault });
  return made.recoveryCode;
}

// ─── Encrypted backups ──────────────────────────────────────────

/**
 * A backup encrypted like the diary here (null if it isn't encrypted here). It carries
 * the vault and the wrapped key, so it opens on any device with the diary password or
 * the recovery code of when it was made.
 */
export function sealCopy(text: string): string | null {
  const lock = readLock();
  const key = getDB().sealing.key;
  if (!lock || !key) return null;
  return serializeSealed(text, key, { vault: lock.vault, deviceKey: lock.deviceKey });
}

/**
 * Opens an encrypted backup: at once if it is this diary's (and it is unlocked);
 * otherwise with its diary password or recovery code. Throws `WrongSecretError`.
 */
export async function openSealedCopy(
  backup: SealedBackup,
  with_?: { password: string } | { code: string },
): Promise<string> {
  const key = getDB().sealing.key;
  if (key) {
    try {
      return openSealed(backup, key);
    } catch {
      // Another diary's (or this one's from before a new key): it needs its password.
    }
  }
  const { vault, deviceKey } = backup.lock as { vault?: VaultData; deviceKey?: unknown };
  if (typeof deviceKey !== 'string') throw new WrongSecretError();
  // From another device with the same diary (its secret is unlocked here).
  const unlocked = unlockedSecret();
  if (unlocked) {
    const opened = await unwrapDeviceKey(unlocked, deviceKey)
      .then((other) => openSealed(backup, other))
      .catch(() => null);
    if (opened !== null) return opened;
  }
  if (!with_ || !vault?.kdf) throw new WrongSecretError();
  const secret =
    'password' in with_
      ? (await openSecret(vault, with_.password)).secret
      : await openSecretWithCode(vault, with_.code);
  try {
    return openSealed(backup, await unwrapDeviceKey(secret, deviceKey));
  } catch {
    throw new WrongSecretError();
  }
}
