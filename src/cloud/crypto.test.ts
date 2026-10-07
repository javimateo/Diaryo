import { describe, expect, it } from 'vitest';
import {
  changePassword,
  createVault,
  decrypt,
  encrypt,
  formatRecoveryCode,
  itemName,
  keysMatch,
  newRecoveryCode,
  openSecret,
  parseRecoveryCode,
  recoverWithCode,
  unlockWithPassword,
  unwrapDeviceKey,
  wrapDeviceKey,
  WrongSecretError,
} from './crypto';

// Few iterations: the tests check the logic, not the cost.
const FAST = 1000;
const text = (s: string) => new TextEncoder().encode(s);
const read = (b: Uint8Array) => new TextDecoder().decode(b);

describe('recovery code', () => {
  it('writes 30 bytes as 12 groups of 4 and reads them back', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(30));
    const code = formatRecoveryCode(bytes);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){11}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(parseRecoveryCode(code)).toEqual(bytes);
  });

  it('forgives case, spaces and look-alike letters', () => {
    const bytes = new Uint8Array(30).fill(0);
    const code = formatRecoveryCode(bytes);
    expect(code.startsWith('0000')).toBe(true);
    const typed = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
    expect(parseRecoveryCode(typed)).toEqual(bytes);
  });

  it('refuses something that is not a full code', () => {
    expect(parseRecoveryCode('ABCD-EFGH')).toBeNull();
    expect(parseRecoveryCode('U'.repeat(48))).toBeNull();
  });
});

describe('vault', () => {
  it('unlocks with the password, and the keys work', async () => {
    const { vault, keys } = await createVault('una contraseña', FAST);
    const sealed = await encrypt(keys.enc, text('hola'));
    const opened = await unlockWithPassword(vault, 'una contraseña');
    expect(read(await decrypt(opened.enc, sealed))).toBe('hola');
    expect(await itemName(opened.mac, 'page/1')).toBe(await itemName(keys.mac, 'page/1'));
    expect(await keysMatch(vault, opened)).toBe(true);
  });

  it('keeps only ciphertext: no password, no secret', async () => {
    const { vault } = await createVault('una contraseña', FAST);
    expect(JSON.stringify(vault)).not.toContain('una contraseña');
  });

  it('refuses a wrong password', async () => {
    const { vault } = await createVault('una contraseña', FAST);
    await expect(unlockWithPassword(vault, 'otra')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('recovers with the code and sets a new password', async () => {
    const { vault, keys, recoveryCode } = await createVault('olvidada', FAST);
    const sealed = await encrypt(keys.enc, text('secreto'));
    const recovered = await recoverWithCode(vault, recoveryCode, 'nueva');
    expect(read(await decrypt(recovered.keys.enc, sealed))).toBe('secreto');
    await expect(unlockWithPassword(recovered.vault, 'olvidada')).rejects.toThrow();
    await expect(unlockWithPassword(recovered.vault, 'nueva')).resolves.toBeTruthy();
    await expect(
      recoverWithCode(vault, recoveryCode.replace(/^.{4}/, 'ZZZZ'), 'x'),
    ).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('changes the password without changing the diary key', async () => {
    const { vault, keys } = await createVault('antes', FAST);
    const sealed = await encrypt(keys.enc, text('igual'));
    await expect(changePassword(vault, 'mal', 'después')).rejects.toBeInstanceOf(WrongSecretError);
    const next = await changePassword(vault, 'antes', 'después');
    const opened = await unlockWithPassword(next, 'después');
    expect(read(await decrypt(opened.enc, sealed))).toBe('igual');
  });

  it('makes a new recovery code, and the old one stops working', async () => {
    const { vault, recoveryCode } = await createVault('clave', FAST);
    const next = await newRecoveryCode(vault, 'clave');
    expect(next.recoveryCode).not.toBe(recoveryCode);
    await expect(recoverWithCode(next.vault, recoveryCode, 'x')).rejects.toThrow();
    await expect(recoverWithCode(next.vault, next.recoveryCode, 'x')).resolves.toBeTruthy();
  });

  it('tells keys from another vault apart', async () => {
    const a = await createVault('a', FAST);
    const b = await createVault('b', FAST);
    expect(await keysMatch(a.vault, b.keys)).toBe(false);
  });
});

describe("the device's own key", () => {
  it('is wrapped with the diary secret, and only that one opens it', async () => {
    const { vault } = await createVault('una contraseña', FAST);
    const { secret } = await openSecret(vault, 'una contraseña');
    const key = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapDeviceKey(secret, key);
    expect(await unwrapDeviceKey(secret, wrapped)).toEqual(key);
    const other = await openSecret((await createVault('otra', FAST)).vault, 'otra');
    await expect(unwrapDeviceKey(other.secret, wrapped)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('a vault made for an existing secret opens to the same one', async () => {
    const first = await createVault('una contraseña', FAST);
    const { secret } = await openSecret(first.vault, 'una contraseña');
    const again = await createVault('otra contraseña', FAST, secret);
    expect((await openSecret(again.vault, 'otra contraseña')).secret).toEqual(secret);
    const recovered = await recoverWithCode(again.vault, again.recoveryCode, 'nueva');
    expect(recovered.secret).toEqual(secret);
  });
});
