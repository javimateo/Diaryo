import {
  countPrivateNotes,
  getDB,
  privateNoteIds,
  releasePrivateNotes,
  rewriteDiary,
} from '../storage/db';
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
  privateKeyOf,
  recoverWithCode,
  unwrapDeviceKey,
  wrapDeviceKey,
  WrongSecretError,
  type VaultData,
} from './crypto';
import {
  applyPrivacy,
  lockChannel,
  postLock,
  readLock,
  setUnlockedSecret,
  unlockedSecret,
  useLock,
  writeLock,
  type LockLevel,
  type LockMessage,
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
 * The diary password on this device (docs/privacy.md): only the private notes encrypted,
 * or the whole diary. It uses the diary password and recovery code, the same ones as the
 * cloud. The whole diary is encrypted with a key of its own (storage/sealing.ts), wrapped
 * with the diary secret, so changing the account or the password never encrypts it
 * again; the private notes, with a key from the secret itself (the same on every device).
 * The keys are only in memory, and the windows of the app (tabs, the desk on the desktop)
 * pass them to each other.
 */

const vaultData = ({ kdf, wrappedKey, recoveryKey, check }: VaultData): VaultData => ({
  kdf,
  wrappedKey,
  recoveryKey,
  check,
});

const accountId = () => useAccount.getState().account?.id ?? null;

/** What the record says: whether writes go encrypted, and what the app shows. */
function applyRecord(lock: LockRecord | null) {
  const db = getDB();
  db.sealing.seal = lock?.level === 'all' && lock.rewriting !== 'open';
  const status = lock?.level !== 'all' ? 'off' : db.sealing.key ? 'unlocked' : 'locked';
  useLock.setState({ level: lock?.level ?? 'off', status });
}

// ─── Between windows ────────────────────────────────────────────

const post = postLock;

function onMessage(message: LockMessage) {
  const lock = readLock();
  const db = getDB();
  if (message.type === 'ask') {
    const secret = unlockedSecret();
    if (secret && db.sealing.key) post({ type: 'secret', secret });
    const { shown } = useLock.getState();
    if (db.sealing.privateKey) post({ type: 'privacy', key: db.sealing.privateKey, shown });
  } else if (message.type === 'secret') {
    if (lock?.level === 'all' && useLock.getState().status === 'locked') {
      void open(lock, message.secret, false).catch(() => undefined);
    }
  } else if (message.type === 'changed') {
    applyRecord(lock);
    if (!lock) {
      db.sealing.key = null;
      setUnlockedSecret(null);
    } else if (lock.level === 'all' && message.secret && !db.sealing.key) {
      void open(lock, message.secret, false).catch(() => undefined);
    }
  } else if (message.type === 'privacy') {
    void applyPrivacy(message.key, message.shown);
  } else if (message.type === 'lock') {
    location.reload();
  }
}

/**
 * Before anything reads the diary: whether it is encrypted here. Another window already
 * unlocked (or showing the private notes) may pass its keys.
 */
export function startLock() {
  const lock = readLock();
  applyRecord(lock);
  if (lockChannel) lockChannel.onmessage = (e: MessageEvent<LockMessage>) => onMessage(e.data);
  if (lock) post({ type: 'ask' });
}

// ─── The diary secret ───────────────────────────────────────────

async function newerCloudVault(lock: LockRecord): Promise<VaultRecord | null> {
  if (!lock.account || lock.account !== accountId()) return null;
  const vault = await fetchVault().catch(() => null);
  return vault && (vault.version ?? 0) > lock.version ? vault : null;
}

/**
 * The diary secret from its password. If it doesn't open the copy of the vault here, the
 * password may have changed on another device while this one was offline: the cloud's
 * one is tried (and kept).
 */
async function secretFor(lock: LockRecord, password: string) {
  try {
    return (await openSecret(lock.vault, password)).secret;
  } catch (error) {
    const newer = await newerCloudVault(lock);
    if (!(error instanceof WrongSecretError) || !newer) throw error;
    const { secret } = await openSecret(newer, password);
    writeLock({ ...lock, vault: vaultData(newer), version: newer.version });
    return secret;
  }
}

// ─── The whole diary: locked and unlocked ───────────────────────

/**
 * Opens the diary with its secret: the device's key, and the cloud's keys if they are
 * the same diary's. A rewrite cut halfway goes on (only in the window the user unlocked).
 */
async function open(lock: LockRecord, secret: Uint8Array<ArrayBuffer>, resume: boolean) {
  getDB().sealing.key = await unwrapDeviceKey(secret, lock.deviceKey!);
  setUnlockedSecret(secret);
  if (resume && lock.rewriting) await rewrite(lock.rewriting);
  applyRecord(readLock());
  await takeDeviceSecret(secret).catch(() => undefined);
}

/** Unlocks the whole diary with the diary password. */
export async function unlockDiary(password: string) {
  const lock = readLock();
  if (!lock) return;
  const secret = await secretFor(lock, password);
  await open(readLock()!, secret, true);
  post({ type: 'secret', secret });
}

/**
 * Unlocks with the recovery code and sets a new password: the whole diary, or the private
 * notes are shown. With the account's vault, the cloud's changes too (if there is a
 * connection; otherwise only this device's copy).
 */
export async function recoverDiary(code: string, newPassword: string, notes: Notes = []) {
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
  if (lock.level === 'all') {
    await open(readLock()!, recovered.secret, true);
    post({ type: 'secret', secret: recovered.secret });
  } else {
    await show(recovered.secret, await which(notes));
  }
  if (lock.account && lock.account === accountId()) {
    await recover(code, newPassword).catch((error) =>
      console.error("Couldn't change the cloud's diary password", error),
    );
  }
}

// ─── The private notes: shown and hidden ────────────────────────

/** Some private notes (their ids), or all of them. */
export type Notes = readonly string[] | 'all';

const which = async (notes: Notes) => (notes === 'all' ? privateNoteIds(getDB()) : notes);

/** These notes are shown too (in every window), with the key from the secret. */
async function show(secret: Uint8Array<ArrayBuffer>, notes: readonly string[]) {
  setUnlockedSecret(secret);
  const key = await privateKeyOf(secret);
  const shown = [...new Set([...useLock.getState().shown, ...notes])];
  await applyPrivacy(key, shown);
  post({ type: 'privacy', key, shown });
}

/**
 * Shows these private notes (each one opens on its own: the others stay hidden), or all
 * of them, with the diary password. Without the password set on this device yet (the
 * private notes came from the cloud), the account's one: this device keeps it for them
 * from then on.
 */
export async function revealNotes(password: string, notes: Notes) {
  const lock = readLock();
  if (!lock) {
    await enableLock(password, 'private', await which(notes));
    return;
  }
  await show(await secretFor(lock, password), await which(notes));
}

/**
 * Notes marked as private just now, with the key here (others are shown): they stay
 * shown, without asking. Returns false if the password is needed.
 */
export async function showAlso(notes: readonly string[]): Promise<boolean> {
  const key = getDB().sealing.privateKey;
  if (!key) return false;
  const shown = [...new Set([...useLock.getState().shown, ...notes])];
  await applyPrivacy(key, shown);
  post({ type: 'privacy', key, shown });
  return true;
}

/** Hides these private notes again (or all), in every window. */
export async function hideNotes(notes: Notes) {
  const shown = notes === 'all' ? [] : useLock.getState().shown.filter((id) => !notes.includes(id));
  const key = shown.length > 0 ? (getDB().sealing.privateKey ?? null) : null;
  if (!key && readLock()?.level !== 'all') setUnlockedSecret(null);
  await applyPrivacy(key, shown);
  post({ type: 'privacy', key, shown });
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
  if (mode === 'open') db.sealing.key = null;
  if (lock) writeLock({ ...lock, rewriting: undefined });
  applyRecord(readLock());
  post({ type: 'changed', secret: null });
}

/**
 * Sets the diary password on this device: for the private notes only, or encrypting the
 * whole diary. With a password here already (the private notes), it is that one; signed
 * in with a cloud diary, its password (no new recovery code); otherwise, a new one, and
 * its recovery code is returned to show it once. The private notes are shown afterwards
 * if it was for them.
 */
export async function enableLock(
  password: string,
  level: LockLevel,
  notes: readonly string[] = [],
): Promise<string | null> {
  const db = getDB();
  const here = readLock();
  let lock: Omit<LockRecord, 'deviceKey' | 'level'>;
  let secret: Uint8Array<ArrayBuffer>;
  let code: string | null = null;
  if (here) {
    secret = await secretFor(here, password);
    lock = readLock()!;
  } else {
    const account = accountId();
    const cloud = account ? await fetchVault() : null;
    if (cloud) {
      ({ secret } = await openSecret(cloud, password));
      lock = { vault: vaultData(cloud), version: cloud.version ?? 0, account };
    } else {
      secret = newSealingKey();
      const created = await createVault(password, PBKDF2_ITERATIONS, secret);
      lock = { vault: created.vault, version: 0, account: null };
      code = created.recoveryCode;
    }
  }
  setUnlockedSecret(secret);
  if (level === 'private') {
    writeLock({ ...lock, level, deviceKey: null });
    applyRecord(readLock());
    post({ type: 'changed', secret: null });
    await takeDeviceSecret(secret).catch(() => undefined);
    // The key stays in memory only to show the notes it was set for.
    if (notes.length > 0) await show(secret, notes);
    return code;
  }
  const key = newSealingKey();
  writeLock({ ...lock, level, deviceKey: await wrapDeviceKey(secret, key), rewriting: 'seal' });
  db.sealing.key = key;
  applyRecord(readLock());
  post({ type: 'changed', secret });
  await forgetKeptKeys();
  await takeDeviceSecret(secret).catch(() => undefined);
  await rewrite('seal');
  return code;
}

/** How many private notes there are (to ask what happens to them). */
export const privateNotes = () => countPrivateNotes(getDB());

/**
 * Lowers what is encrypted here (asks for the password, to be sure): from the whole
 * diary to only the private notes, or to nothing. To nothing, the private notes stop
 * being private (`open`) or are deleted (`delete`).
 */
export async function disableLock(
  password: string,
  to: 'private' | 'off',
  notes?: 'open' | 'delete',
) {
  const lock = readLock();
  if (!lock) return;
  const db = getDB();
  const secret = await secretFor(lock, password);
  if (to === 'off' && (await privateNotes()) > 0) {
    // They are shown to read them, and then released (the windows load them again).
    await show(secret, await which('all'));
    await releasePrivateNotes(db, notes ?? 'open');
    await hideNotes('all');
  }
  if (lock.level === 'all') {
    const next: LockRecord =
      to === 'private' ? { ...lock, level: 'private', deviceKey: null } : { ...lock };
    writeLock({ ...next, rewriting: 'open' });
    applyRecord(readLock());
    post({ type: 'changed', secret: null });
    await rewrite('open');
  }
  if (to === 'off') {
    writeLock(null);
    setUnlockedSecret(null);
    applyRecord(null);
    post({ type: 'changed', secret: null });
    await keepKeysOnDevice();
  }
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
  db.sealing.privateKey = null;
  db.sealing.shown = new Set();
  setUnlockedSecret(null);
  applyRecord(null);
  useLock.setState({ shown: [], revealed: false });
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
  if (!lock) throw new Error('there is no diary password here');
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
  if (!lock?.deviceKey || !key) return null;
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
