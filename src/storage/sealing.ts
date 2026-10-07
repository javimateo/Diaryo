import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import type { DBCore, DBCoreCursor, DBCoreTable, Middleware } from 'dexie';

/**
 * The diary encrypted on the device (docs/privacy.md). Every read and write of the diary's
 * tables goes through here: a row keeps in the clear only what IndexedDB indexes (ids,
 * the page's day, its last change) and the rest goes, encrypted, in `sealed`.
 *
 * The cipher is synchronous (XChaCha20-Poly1305 from @noble/ciphers): Web Crypto is
 * asynchronous, and waiting for it inside an IndexedDB transaction closes the
 * transaction. That way the rest of `storage` (and the sync) doesn't know about it.
 *
 * Sealed and plain rows are both read: turning encryption on or off rewrites the diary
 * in batches, and a half-done rewrite is just carried on.
 */

/** What each table keeps in the clear: the fields IndexedDB indexes. */
const CLEAR: Record<string, readonly string[]> = {
  pages: ['id', 'date', 'updatedAt'],
  elements: ['pageId', 'id'],
  assets: ['id'],
  fonts: ['id'],
};

const NONCE_BYTES = 24;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** This device's state: the key (while unlocked) and whether new writes are sealed. */
export interface Sealing {
  key: Uint8Array<ArrayBuffer> | null;
  /** Writes are sealed (the diary is encrypted, or being encrypted). */
  seal: boolean;
}

/** The diary is encrypted and locked: nothing can be read or written without the key. */
export class LockedError extends Error {
  constructor() {
    super('the diary is locked');
  }
}

interface SealedRow {
  sealed: Uint8Array;
  [field: string]: unknown;
}

const isSealed = (value: unknown): value is SealedRow =>
  typeof value === 'object' && value !== null && (value as SealedRow).sealed instanceof Uint8Array;

/** Whether a row read straight from IndexedDB is encrypted. */
export const rowIsSealed = isSealed;

/**
 * The cipher is bound to the table and the row's key: a sealed row moved to another place
 * doesn't open.
 */
const boundTo = (table: string, key: unknown) => encoder.encode(`${table}:${JSON.stringify(key)}`);

/** Encrypts bytes (with a fresh nonce in front), bound to `context`. */
export function sealBytes(secret: Uint8Array, bytes: Uint8Array, context: Uint8Array) {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const box = xchacha20poly1305(secret, nonce, context).encrypt(bytes);
  const sealed = new Uint8Array(NONCE_BYTES + box.length);
  sealed.set(nonce);
  sealed.set(box, NONCE_BYTES);
  return sealed;
}

/** The opposite of `sealBytes`. Throws with another key, context or changed bytes. */
export function openBytes(secret: Uint8Array, sealed: Uint8Array, context: Uint8Array) {
  const nonce = sealed.subarray(0, NONCE_BYTES);
  return xchacha20poly1305(secret, nonce, context).decrypt(sealed.subarray(NONCE_BYTES));
}

function seal(table: string, key: unknown, value: Record<string, unknown>, secret: Uint8Array) {
  const clear = CLEAR[table];
  const row: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [field, data] of Object.entries(value)) {
    if (clear.includes(field)) row[field] = data;
    else rest[field] = data;
  }
  const bytes = encoder.encode(JSON.stringify(rest));
  return { ...row, sealed: sealBytes(secret, bytes, boundTo(table, key)) };
}

function unseal(table: string, key: unknown, row: SealedRow, secret: Uint8Array) {
  const { sealed, ...clear } = row;
  const rest = JSON.parse(decoder.decode(openBytes(secret, sealed, boundTo(table, key))));
  return { ...rest, ...clear };
}

function sealedTable(table: DBCoreTable, state: Sealing): DBCoreTable {
  const { name } = table;
  const keyOf = (value: unknown) => table.schema.primaryKey.extractKey!(value);

  // The row's key is in the clear, so it is taken from the row itself.
  const read = (value: unknown) => {
    if (!isSealed(value)) return value;
    if (!state.key) throw new LockedError();
    return unseal(name, keyOf(value), value, state.key);
  };

  const write = (value: Record<string, unknown>) => {
    if (!state.seal) return value;
    if (!state.key) throw new LockedError();
    return seal(name, keyOf(value), value, state.key);
  };

  const cursorOf = (cursor: DBCoreCursor): DBCoreCursor =>
    Object.create(cursor, {
      value: { get: () => read(cursor.value) },
    });

  // `then`, not `await`: Dexie keeps its transaction along its own promises, and a native
  // `await` here would lose it.
  return {
    ...table,
    mutate: (req) => {
      if (req.type !== 'add' && req.type !== 'put') return table.mutate(req);
      try {
        return table.mutate({ ...req, values: req.values.map(write) });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    get: (req) => table.get(req).then(read),
    getMany: (req) => table.getMany(req).then((values) => values.map(read)),
    query: (req) =>
      table.query(req).then((res) => (req.values ? { ...res, result: res.result.map(read) } : res)),
    openCursor: (req) =>
      table
        .openCursor(req)
        .then((cursor) => (cursor && req.values !== false ? cursorOf(cursor) : cursor)),
  };
}

/** The middleware for a database, with that database's state. */
export function sealingMiddleware(state: Sealing): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'Sealing',
    // Right above IndexedDB: Dexie's own middlewares (hooks, caches) see the rows as they are.
    level: -2,
    create: (down) => ({
      ...down,
      table: (name) => {
        const table = down.table(name);
        return name in CLEAR ? sealedTable(table, state) : table;
      },
    }),
  };
}

/** A new key for a diary (32 random bytes). */
export const newSealingKey = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
