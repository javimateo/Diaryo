import type { DiaryKeys } from './crypto';

/**
 * Where a device keeps the diary keys once unlocked: IndexedDB, as non-extractable
 * `CryptoKey`s (the page can use them, not read them). One entry per account.
 */
const DB_NAME = 'diaryo-keys';
const STORE = 'keys';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const saveKeys = (account: string, keys: DiaryKeys) =>
  run('readwrite', (store) => store.put(keys, account)).then(() => undefined);

export async function loadKeys(account: string): Promise<DiaryKeys | null> {
  const keys = (await run('readonly', (store) => store.get(account))) as DiaryKeys | undefined;
  return keys?.enc && keys.mac ? keys : null;
}

/** Forgets every account's keys (when signing out). */
export const forgetKeys = () => run('readwrite', (store) => store.clear()).then(() => undefined);
