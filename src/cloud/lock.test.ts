import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteElement } from '../engine/elements';
import { rowIsSealed } from '../storage/sealing';

/**
 * The diary encrypted on the device (lock.ts), with the cloud's vault on a fake server.
 * Each `boot` is the app starting again: new modules over the same storage.
 */

const fake = vi.hoisted(() => {
  type Listener = (token: string, record: unknown) => void;
  const listeners: Listener[] = [];
  const state = {
    record: null as { id: string; email: string; verified: boolean } | null,
    vault: null as Record<string, unknown> | null,
    online: true,
  };
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));
  const pb = {
    authStore: {
      get record() {
        return state.record;
      },
      get isValid() {
        return !!state.record;
      },
      onChange: (listener: Listener) => listeners.push(listener),
    },
    collection: () => ({
      getList: () =>
        state.online ? Promise.resolve({ items: state.vault ? [state.vault] : [] }) : offline(),
      create: (data: Record<string, unknown>) => {
        if (!state.online) return offline();
        state.vault = { ...data, id: 'v1', version: 0 };
        return Promise.resolve(state.vault);
      },
      update: (_: string, data: Record<string, unknown>) => {
        if (!state.online) return offline();
        state.vault = { ...state.vault, ...data };
        return Promise.resolve(state.vault);
      },
    }),
  };
  return {
    state,
    pb,
    signIn(id: string) {
      state.record = { id, email: `${id}@diaryo.test`, verified: true };
      listeners.forEach((listener) => listener('token', state.record));
    },
  };
});

vi.mock('./client', () => ({ pb: fake.pb, CLOUD_URL: 'http://cloud.test', SESSION_KEY: 's' }));

const note = (id: string, text: string): NoteElement => ({
  id,
  type: 'note',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  width: 220,
  height: 220,
  text,
  fontSize: 20,
  variant: 'plain',
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
});

/** The app starts: the modules are loaded again over the same storage. */
async function boot() {
  vi.resetModules();
  const storage = await import('../storage/db');
  const lock = await import('./lock');
  const state = await import('./lockState');
  const vault = await import('./vault');
  const crypto = await import('./crypto');
  const account = await import('./account');
  const keystore = await import('./keystore');
  lock.startLock();
  const db = storage.getDB();
  const write = (text: string) =>
    storage.saveChanges(db, storage.DESK_INFO, {
      upserts: [note('n1', text)],
      deletes: [],
      assets: [],
      fonts: [],
    });
  const read = async () => {
    const [el] = (await storage.loadPage(db, storage.DESK_ID)).elements;
    return (el as NoteElement | undefined)?.text;
  };
  /** A private note, and how it reads now (its text, or empty if hidden). */
  const writePrivate = (text: string, id = 'p1') =>
    storage.saveChanges(db, storage.DESK_INFO, {
      upserts: [{ ...note(id, text), private: true }],
      deletes: [],
      assets: [],
      fonts: [],
    });
  const readPrivate = async (id = 'p1') => {
    const elements = (await storage.loadPage(db, storage.DESK_ID)).elements;
    return (elements.find((el) => el.id === id) as NoteElement | undefined)?.text;
  };
  const status = () => state.useLock.getState().status;
  const level = () => state.useLock.getState().level;
  return {
    ...{ storage, lock, state, vault, crypto, account, keystore, db },
    ...{ write, read, writePrivate, readPrivate, status, level },
  };
}

type App = Awaited<ReturnType<typeof boot>>;
let app: App | null = null;

/** The app is closed (its database too, so the next boot opens it again). */
function close() {
  app?.db.close();
  app = null;
}

async function start() {
  close();
  app = await boot();
  return app;
}

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  // One window at a time, except where it says otherwise.
  vi.stubGlobal('BroadcastChannel', undefined);
  fake.state.record = null;
  fake.state.vault = null;
  fake.state.online = true;
});

afterEach(async () => {
  close();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('diaryo');
    request.onsuccess = request.onerror = () => resolve();
  });
});

describe('a password for the diary on this device', () => {
  it('encrypts the diary, which then opens only with the password', async () => {
    let a = await start();
    await a.write('mi pin es 4321');
    const code = await a.lock.enableLock('contraseña larga', 'all');
    expect(code).toMatch(/^(\w{4}-){11}\w{4}$/);
    expect(a.status()).toBe('unlocked');
    expect(await a.read()).toBe('mi pin es 4321');

    a = await start();
    expect(a.status()).toBe('locked');
    await expect(a.read()).rejects.toThrow('locked');
    await expect(a.lock.unlockDiary('otra')).rejects.toBeInstanceOf(a.crypto.WrongSecretError);
    await a.lock.unlockDiary('contraseña larga');
    expect(a.status()).toBe('unlocked');
    expect(await a.read()).toBe('mi pin es 4321');
  });

  it('recovers with the code, changes the password and makes a new code', async () => {
    let a = await start();
    await a.write('hola');
    const code = (await a.lock.enableLock('primera contraseña', 'all'))!;

    a = await start();
    await a.lock.recoverDiary(code, 'segunda contraseña');
    expect(await a.read()).toBe('hola');

    a = await start();
    await expect(a.lock.unlockDiary('primera contraseña')).rejects.toThrow();
    await a.lock.unlockDiary('segunda contraseña');
    await a.lock.changeLockPassword('segunda contraseña', 'tercera contraseña');
    const fresh = await a.lock.newLockRecoveryCode('tercera contraseña');

    a = await start();
    await expect(a.lock.recoverDiary(code, 'x'.repeat(8))).rejects.toThrow();
    await a.lock.recoverDiary(fresh, 'cuarta contraseña');
    expect(await a.read()).toBe('hola');
  });

  it('decrypts it again, and goes on with a rewrite cut halfway', async () => {
    let a = await start();
    await a.write('hola');
    await a.lock.enableLock('contraseña larga', 'all');
    // As if the app had closed while encrypting: a row is still in the clear.
    a.db.sealing.seal = false;
    await a.write('aún sin cifrar');
    a.state.writeLock({ ...a.state.readLock()!, rewriting: 'seal' });

    a = await start();
    await a.lock.unlockDiary('contraseña larga');
    expect(a.state.readLock()?.rewriting).toBeUndefined();
    const rows = await new Promise<unknown[]>((resolve) => {
      const request = indexedDB.open('diaryo');
      request.onsuccess = () => {
        const all = request.result.transaction('elements').objectStore('elements').getAll();
        all.onsuccess = () => {
          request.result.close();
          resolve(all.result);
        };
      };
    });
    expect(rows.every(rowIsSealed)).toBe(true);

    await a.lock.disableLock('contraseña larga', 'off');
    expect(a.status()).toBe('off');
    expect(a.state.readLock()).toBeNull();
    a = await start();
    expect(a.status()).toBe('off');
    expect(await a.read()).toBe('aún sin cifrar');
  });

  it('another window already open passes the secret', async () => {
    vi.unstubAllGlobals();
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const first = await boot();
    await first.write('hola');
    await first.lock.enableLock('contraseña larga', 'all');
    const second = await boot();
    await vi.waitFor(() => expect(second.status()).toBe('unlocked'));
    expect(await second.read()).toBe('hola');
    first.db.close();
    app = second;
  });
});

describe('the same diary password as the cloud', () => {
  it("the device's own vault goes to the cloud as it is", async () => {
    const a = await start();
    const code = (await a.lock.enableLock('contraseña larga', 'all'))!;
    fake.signIn('ana');
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('none'));
    expect(a.vault.hasOwnVault()).toBe(true);
    expect(await a.vault.setUpVault('contraseña larga')).toBeNull();
    expect(fake.state.vault?.wrappedKey).toBe(a.state.readLock()!.vault.wrappedKey);
    expect(a.state.readLock()!.account).toBe('ana');
    // The same code opens the cloud's diary.
    const cloud = fake.state.vault as never;
    await expect(a.crypto.recoverWithCode(cloud, code, 'nueva contraseña')).resolves.toBeTruthy();
  });

  it("signed in with a cloud diary, the device takes the account's password", async () => {
    // Another device made the account's vault.
    const other = await (await import('./crypto')).createVault('la de la nube', 1000);
    fake.state.vault = { ...other.vault, id: 'v1', version: 3 };

    let a = await start();
    await a.write('hola');
    await a.lock.enableLock('la de aquí', 'all');
    fake.signIn('ana');
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('locked'));
    expect(await a.vault.unlock('la de la nube')).toBe(true);
    expect(a.state.readLock()).toMatchObject({ account: 'ana', version: 3 });

    a = await start();
    await expect(a.lock.unlockDiary('la de aquí')).rejects.toThrow();
    await a.lock.unlockDiary('la de la nube');
    expect(await a.read()).toBe('hola');
    // The cloud's keys come from the password, and aren't kept on disk.
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('unlocked'));
    expect(await a.keystore.loadKeys('ana')).toBeNull();
  });

  it('turned on while signed in, it uses the cloud diary password', async () => {
    const other = await (await import('./crypto')).createVault('la de la nube', 1000);
    fake.state.vault = { ...other.vault, id: 'v1', version: 1 };
    fake.state.record = { id: 'ana', email: 'ana@diaryo.test', verified: true };
    const a = await start();
    await expect(a.lock.enableLock('otra', 'all')).rejects.toBeInstanceOf(
      a.crypto.WrongSecretError,
    );
    expect(await a.lock.enableLock('la de la nube', 'all')).toBeNull();
    expect(a.state.readLock()).toMatchObject({ account: 'ana', version: 1 });
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('unlocked'));
  });

  it('follows a password changed on another device, also when it was offline', async () => {
    const other = await (await import('./crypto')).createVault('primera contraseña', 1000);
    fake.state.vault = { ...other.vault, id: 'v1', version: 1 };
    fake.state.record = { id: 'ana', email: 'ana@diaryo.test', verified: true };
    let a = await start();
    await a.write('hola');
    await a.lock.enableLock('primera contraseña', 'all');

    // Changed on another device while this one is closed.
    const changed = await a.crypto.changePassword(
      fake.state.vault as never,
      'primera contraseña',
      'segunda contraseña',
    );
    fake.state.vault = { ...fake.state.vault, ...changed, version: 2 };
    a = await start();
    await a.lock.unlockDiary('segunda contraseña');
    expect(await a.read()).toBe('hola');
    expect(a.state.readLock()!.version).toBe(2);

    // Offline, the copy here still opens with it.
    fake.state.online = false;
    a = await start();
    await a.lock.unlockDiary('segunda contraseña');
    expect(await a.read()).toBe('hola');
  });
});

describe('encrypted copies', () => {
  it('open here at once, and elsewhere with the password or the code', async () => {
    let a = await start();
    await a.write('hola');
    const code = (await a.lock.enableLock('contraseña larga', 'all'))!;
    const text = JSON.stringify({ type: 'diaryo/diary', pages: [] });
    const sealed = a.lock.sealCopy(text)!;
    expect(sealed).not.toContain('diaryo/diary');
    const backup = (await import('../storage/files')).parseBackup(sealed);
    expect(backup?.kind).toBe('sealed');
    if (backup?.kind !== 'sealed') return;
    expect(await a.lock.openSealedCopy(backup.sealed)).toBe(text);

    // Another device, without this diary.
    await a.lock.disableLock('contraseña larga', 'off');
    localStorage.removeItem('diaryo:lock');
    a = await start();
    await expect(a.lock.openSealedCopy(backup.sealed)).rejects.toBeInstanceOf(
      a.crypto.WrongSecretError,
    );
    await expect(a.lock.openSealedCopy(backup.sealed, { password: 'otra' })).rejects.toBeInstanceOf(
      a.crypto.WrongSecretError,
    );
    expect(await a.lock.openSealedCopy(backup.sealed, { password: 'contraseña larga' })).toBe(text);
    expect(await a.lock.openSealedCopy(backup.sealed, { code })).toBe(text);
  });

  it("aren't made when the diary isn't encrypted", async () => {
    const a = await start();
    expect(a.lock.sealCopy('{}')).toBeNull();
  });
});

describe('private notes', () => {
  it('a password only for them: the diary opens, each one shows with the password', async () => {
    let a = await start();
    await a.write('a la vista');
    const code = (await a.lock.enableLock('contraseña larga', 'private', ['p1', 'p2']))!;
    expect(code).toMatch(/^(\w{4}-){11}\w{4}$/);
    expect([a.status(), a.level()]).toEqual(['off', 'private']);
    await a.writePrivate('pin 4321', 'p1');
    await a.writePrivate('correo hola2026', 'p2');
    await a.lock.hideNotes('all');
    expect(await a.readPrivate('p1')).toBe('');

    a = await start();
    expect(a.status()).toBe('off');
    expect(await a.read()).toBe('a la vista');
    await expect(a.lock.revealNotes('otra', ['p1'])).rejects.toBeInstanceOf(
      a.crypto.WrongSecretError,
    );
    // Only the one asked for shows.
    await a.lock.revealNotes('contraseña larga', ['p1']);
    expect(await a.readPrivate('p1')).toBe('pin 4321');
    expect(await a.readPrivate('p2')).toBe('');
    await a.lock.revealNotes('contraseña larga', ['p2']);
    expect(await a.readPrivate('p2')).toBe('correo hola2026');
    // Hidden again one by one; with none shown, the key goes.
    await a.lock.hideNotes(['p1']);
    expect([await a.readPrivate('p1'), await a.readPrivate('p2')]).toEqual(['', 'correo hola2026']);
    await a.lock.hideNotes(['p2']);
    expect(a.db.sealing.privateKey).toBeNull();

    a = await start();
    await a.lock.revealNotes('contraseña larga', 'all');
    expect([await a.readPrivate('p1'), await a.readPrivate('p2')]).toEqual([
      'pin 4321',
      'correo hola2026',
    ]);

    a = await start();
    await a.lock.recoverDiary(code, 'nueva contraseña', ['p2']);
    expect([await a.readPrivate('p1'), await a.readPrivate('p2')]).toEqual(['', 'correo hola2026']);
  });

  it('notes marked while others are shown stay shown, without asking', async () => {
    const a = await start();
    expect(await a.lock.showAlso(['p2'])).toBe(false);
    await a.lock.enableLock('contraseña larga', 'private', ['p1']);
    await a.writePrivate('pin 4321', 'p1');
    expect(await a.lock.showAlso(['p2'])).toBe(true);
    await a.writePrivate('otro', 'p2');
    expect(await a.readPrivate('p2')).toBe('otro');
  });

  it('from only them to the whole diary and back, and off keeping or deleting them', async () => {
    let a = await start();
    await a.lock.enableLock('contraseña larga', 'private', ['p1']);
    await a.writePrivate('pin 4321');
    expect(await a.lock.enableLock('contraseña larga', 'all')).toBeNull();
    a = await start();
    expect(a.status()).toBe('locked');
    await a.lock.unlockDiary('contraseña larga');
    // Unlocking the whole diary doesn't show them.
    expect(await a.readPrivate()).toBe('');
    await a.lock.disableLock('contraseña larga', 'private');
    expect([a.status(), a.level()]).toEqual(['off', 'private']);

    a = await start();
    expect(await a.lock.privateNotes()).toBe(1);
    await a.lock.disableLock('contraseña larga', 'off', 'open');
    expect(a.level()).toBe('off');
    a = await start();
    expect(await a.readPrivate()).toBe('pin 4321');
    expect(await a.lock.privateNotes()).toBe(0);

    await a.lock.enableLock('contraseña larga', 'private', ['p1']);
    await a.writePrivate('otro pin');
    await a.lock.disableLock('contraseña larga', 'off', 'delete');
    expect(await a.readPrivate()).toBeUndefined();
  });

  it('only for them, the cloud keys stay on the device', async () => {
    const other = await (await import('./crypto')).createVault('la de la nube', 1000);
    fake.state.vault = { ...other.vault, id: 'v1', version: 1 };
    fake.state.record = { id: 'ana', email: 'ana@diaryo.test', verified: true };
    const a = await start();
    expect(await a.lock.enableLock('la de la nube', 'private')).toBeNull();
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('unlocked'));
    await vi.waitFor(async () => expect(await a.keystore.loadKeys('ana')).not.toBeNull());
  });

  it("taking another account's password, hidden ones must be shown first; then they follow", async () => {
    const other = await (await import('./crypto')).createVault('la de la nube', 1000);
    fake.state.vault = { ...other.vault, id: 'v1', version: 2 };
    let a = await start();
    await a.lock.enableLock('la de aquí', 'private', ['p1']);
    await a.writePrivate('pin 4321');
    await a.lock.hideNotes('all');
    fake.signIn('ana');
    await vi.waitFor(() => expect(a.account.useAccount.getState().vault).toBe('locked'));
    await expect(a.vault.unlock('la de la nube')).rejects.toBeInstanceOf(
      a.vault.PrivateHiddenError,
    );
    await a.lock.revealNotes('la de aquí', ['p1']);
    expect(await a.vault.unlock('la de la nube')).toBe(true);
    // Hidden after the change; they open with the account's password.
    expect(await a.readPrivate()).toBe('');

    a = await start();
    await expect(a.lock.revealNotes('la de aquí', ['p1'])).rejects.toThrow();
    await a.lock.revealNotes('la de la nube', ['p1']);
    expect(await a.readPrivate()).toBe('pin 4321');
  });

  it('shown in one window, shown in the others', async () => {
    vi.unstubAllGlobals();
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const first = await boot();
    await first.lock.enableLock('contraseña larga', 'private', ['p1']);
    await first.writePrivate('pin 4321');
    await first.lock.hideNotes('all');
    const second = await boot();
    expect(await second.readPrivate()).toBe('');
    await first.lock.revealNotes('contraseña larga', ['p1']);
    await vi.waitFor(async () => expect(await second.readPrivate()).toBe('pin 4321'));
    await first.lock.hideNotes(['p1']);
    await vi.waitFor(async () => expect(await second.readPrivate()).toBe(''));
    first.db.close();
    app = second;
  });
});
