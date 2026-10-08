/**
 * The cloud's end-to-end encryption (see docs/cloud.md), with the browser's Web Crypto.
 *
 * - The **diary secret**: 32 random bytes, created once. Two keys come from it (HKDF):
 *   one encrypts the items (AES-GCM) and one names them (HMAC). It never leaves the
 *   device unwrapped.
 * - The **diary password** wraps the secret: PBKDF2-SHA-256 turns it into a key.
 * - The **recovery code** wraps it too: 240 random bits, written as 12 groups of 4
 *   letters and digits; being random already, HKDF is enough to make it a key.
 * - A **check** value, encrypted with the diary key, tells at once that a vault was
 *   opened with the right secret.
 */

const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();

export const PBKDF2_ITERATIONS = 600_000;
const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_TEXT = 'diaryo';

// ─── Bytes and text ─────────────────────────────────────────────

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// ─── Recovery code ──────────────────────────────────────────────

/** Crockford's base 32: no I, L, O or U, so nothing is mistaken when copying it by hand. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_BYTES = 30;
const RECOVERY_CHARS = 48;

/** "K7QM-2XRA-…": 12 groups of 4. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{1,4}/g)!.join('-');
}

/**
 * The code's bytes, as typed: any case, with or without dashes or spaces, and with the
 * letters that look like digits (O, I, L) read as those. Null if it isn't a full code.
 */
export function parseRecoveryCode(text: string): Uint8Array<ArrayBuffer> | null {
  const chars = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (chars.length !== RECOVERY_CHARS) return null;
  const bytes = new Uint8Array(RECOVERY_BYTES);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const char of chars) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes[i++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return bytes;
}

// ─── Keys ───────────────────────────────────────────────────────

/** The keys a device keeps once unlocked (they can be used, not read). */
export interface DiaryKeys {
  /** Encrypts and decrypts the items. */
  enc: CryptoKey;
  /** Names the items (HMAC). */
  mac: CryptoKey;
}

/** The keys that come from the diary secret. */
export async function diaryKeys(secret: Uint8Array<ArrayBuffer>): Promise<DiaryKeys> {
  const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const info = (label: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(0),
    info: encoder.encode(`diaryo ${label}`),
  });
  const [enc, mac] = await Promise.all([
    subtle().deriveKey(info('items'), base, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
    subtle().deriveKey(info('names'), base, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);
  return { enc, mac };
}

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function recoveryKey(code: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>) {
  const base = await subtle().importKey('raw', code, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('diaryo recovery') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypting ─────────────────────────────────────────────────

/** AES-GCM with a fresh IV, as base 64 of IV + ciphertext. */
export async function encrypt(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = random(IV_BYTES);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return toBase64(out);
}

/** The opposite of `encrypt`. Throws if the key is wrong or the data was changed. */
export async function decrypt(key: CryptoKey, text: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64(text);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
    key,
    bytes.slice(IV_BYTES),
  );
  return new Uint8Array(plain);
}

/** An item's opaque name: HMAC of what it is ("page/<id>"…), URL-safe base 64. */
export async function itemName(mac: CryptoKey, what: string): Promise<string> {
  const signature = new Uint8Array(await subtle().sign('HMAC', mac, encoder.encode(what)));
  return toBase64(signature).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── The vault ──────────────────────────────────────────────────

/** How the password became a key, and the salts. Saved with the vault. */
export interface VaultKdf {
  alg: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  recoverySalt: string;
}

/** What the server keeps: only wrapped keys and the check (see the `vaults` collection). */
export interface VaultData {
  kdf: VaultKdf;
  wrappedKey: string;
  recoveryKey: string;
  check: string;
}

/** Something went wrong opening a vault: the password or the code isn't the right one. */
export class WrongSecretError extends Error {
  constructor() {
    super('wrong password or recovery code');
  }
}

async function wrapWithPassword(secret: Uint8Array<ArrayBuffer>, password: string, kdf: VaultKdf) {
  return encrypt(await passwordKey(password, fromBase64(kdf.salt), kdf.iterations), secret);
}

async function wrapWithRecovery(
  secret: Uint8Array<ArrayBuffer>,
  code: Uint8Array<ArrayBuffer>,
  kdf: VaultKdf,
) {
  return encrypt(await recoveryKey(code, fromBase64(kdf.recoverySalt)), secret);
}

/** Checks that the secret is this vault's one, and returns its keys. */
async function openWith(vault: VaultData, secret: Uint8Array<ArrayBuffer>): Promise<DiaryKeys> {
  const keys = await diaryKeys(secret);
  const check = await decrypt(keys.enc, vault.check).catch(() => null);
  if (!check || new TextDecoder().decode(check) !== CHECK_TEXT) throw new WrongSecretError();
  return keys;
}

/**
 * A new vault: what to save, the keys and the recovery code. For a new diary secret, or
 * for one that exists already (a diary encrypted on the device goes to the cloud).
 */
export async function createVault(
  password: string,
  iterations = PBKDF2_ITERATIONS,
  secret = random(SECRET_BYTES),
) {
  const code = random(RECOVERY_BYTES);
  const kdf: VaultKdf = {
    alg: 'PBKDF2-SHA-256',
    iterations,
    salt: toBase64(random(SALT_BYTES)),
    recoverySalt: toBase64(random(SALT_BYTES)),
  };
  const keys = await diaryKeys(secret);
  const vault: VaultData = {
    kdf,
    wrappedKey: await wrapWithPassword(secret, password, kdf),
    recoveryKey: await wrapWithRecovery(secret, code, kdf),
    check: await encrypt(keys.enc, encoder.encode(CHECK_TEXT)),
  };
  return { vault, keys, recoveryCode: formatRecoveryCode(code) };
}

/** The diary secret, from the password. */
async function secretFromPassword(vault: VaultData, password: string) {
  const key = await passwordKey(password, fromBase64(vault.kdf.salt), vault.kdf.iterations);
  return decrypt(key, vault.wrappedKey).catch(() => {
    throw new WrongSecretError();
  });
}

/** The diary secret, from the recovery code. */
async function secretFromRecovery(vault: VaultData, code: string) {
  const bytes = parseRecoveryCode(code);
  if (!bytes) throw new WrongSecretError();
  const key = await recoveryKey(bytes, fromBase64(vault.kdf.recoverySalt));
  return decrypt(key, vault.recoveryKey).catch(() => {
    throw new WrongSecretError();
  });
}

/** Unlocks with the diary password. */
export async function unlockWithPassword(vault: VaultData, password: string) {
  return openWith(vault, await secretFromPassword(vault, password));
}

/** The diary secret itself, checked (the device's own encryption needs it, see lock.ts). */
export async function openSecret(vault: VaultData, password: string) {
  const secret = await secretFromPassword(vault, password);
  return { secret, keys: await openWith(vault, secret) };
}

/** The diary secret from the recovery code, checked (to open an encrypted backup). */
export async function openSecretWithCode(vault: VaultData, code: string) {
  const secret = await secretFromRecovery(vault, code);
  await openWith(vault, secret);
  return secret;
}

/**
 * Unlocks with the recovery code and sets a new password: returns the keys and the
 * vault to save (the recovery code keeps working).
 */
export async function recoverWithCode(vault: VaultData, code: string, newPassword: string) {
  const secret = await secretFromRecovery(vault, code);
  const keys = await openWith(vault, secret);
  const kdf = { ...vault.kdf, salt: toBase64(random(SALT_BYTES)), iterations: PBKDF2_ITERATIONS };
  const next: VaultData = {
    ...vault,
    kdf,
    wrappedKey: await wrapWithPassword(secret, newPassword, kdf),
  };
  return { keys, vault: next, secret };
}

/** Changes the diary password (the diary itself isn't encrypted again). */
export async function changePassword(vault: VaultData, current: string, next: string) {
  const secret = await secretFromPassword(vault, current);
  await openWith(vault, secret);
  const kdf = { ...vault.kdf, salt: toBase64(random(SALT_BYTES)), iterations: PBKDF2_ITERATIONS };
  return { ...vault, kdf, wrappedKey: await wrapWithPassword(secret, next, kdf) };
}

/** A new recovery code (the previous one stops working). */
export async function newRecoveryCode(vault: VaultData, password: string) {
  const secret = await secretFromPassword(vault, password);
  await openWith(vault, secret);
  const code = random(RECOVERY_BYTES);
  const kdf = { ...vault.kdf, recoverySalt: toBase64(random(SALT_BYTES)) };
  const next: VaultData = { ...vault, kdf, recoveryKey: await wrapWithRecovery(secret, code, kdf) };
  return { vault: next, recoveryCode: formatRecoveryCode(code) };
}

/** Whether these keys (kept on a device) still open this vault. */
export async function keysMatch(vault: VaultData, keys: DiaryKeys): Promise<boolean> {
  const check = await decrypt(keys.enc, vault.check).catch(() => null);
  return !!check && new TextDecoder().decode(check) === CHECK_TEXT;
}

// ─── The device's own key ───────────────────────────────────────

/** The key that wraps the device's own key (see lock.ts), from the diary secret. */
async function deviceWrapKey(secret: Uint8Array<ArrayBuffer>) {
  const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('diaryo device'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Wraps the key that encrypts the diary on the device with the diary secret. */
export async function wrapDeviceKey(secret: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) {
  return encrypt(await deviceWrapKey(secret), key);
}

/** The opposite of `wrapDeviceKey`. Throws `WrongSecretError` with another secret. */
export async function unwrapDeviceKey(secret: Uint8Array<ArrayBuffer>, wrapped: string) {
  return decrypt(await deviceWrapKey(secret), wrapped).catch(() => {
    throw new WrongSecretError();
  });
}

/**
 * The private notes' key (see storage/sealing.ts), from the diary secret: the same on
 * every device of the diary. Raw bytes: the cipher there is synchronous.
 */
export async function privateKeyOf(secret: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('diaryo private'),
    },
    base,
    256,
  );
  return new Uint8Array(bits);
}
