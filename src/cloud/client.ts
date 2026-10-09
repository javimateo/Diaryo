import PocketBase, { BaseAuthStore, LocalAuthStore, type AuthRecord } from 'pocketbase';
import { readText, writeText } from '../lib/saved';
import { forgetKeys } from './keystore';

/**
 * The cloud server (PocketBase, see docs/cloud.md). `VITE_CLOUD_URL` points to another
 * one (a local server while developing).
 */
export const CLOUD_URL: string =
  import.meta.env.VITE_CLOUD_URL || 'https://cloud.diaryo.javiermateo.dev';

/** The session is remembered on each device (in its local storage). */
export const SESSION_KEY = 'diaryo:cloud-session';

/**
 * "Don't keep the session in this browser" (a shared computer): the session lives in the
 * tab's own storage, and is gone when the tab closes; the cloud's keys aren't kept on
 * disk either (vault.ts).
 */
const KEEP_KEY = 'diaryo:keep-session';
export const keepsSession = () => readText(KEEP_KEY) !== '0';

/** The session in the tab's storage (`sessionStorage`), in the same form as the local one. */
class TabAuthStore extends BaseAuthStore {
  constructor() {
    super();
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
      if (saved?.token) super.save(saved.token, saved.record ?? null);
    } catch {
      // Nothing saved, or unreadable: signed out.
    }
  }

  save(token: string, record?: AuthRecord) {
    super.save(token, record);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, record }));
    } catch {
      // Without storage it lasts while the page is open.
    }
  }

  clear() {
    super.clear();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

export const pb = new PocketBase(
  CLOUD_URL,
  keepsSession() ? new LocalAuthStore(SESSION_KEY) : new TabAuthStore(),
);

/**
 * Keeps the session in this browser, or only in this tab: the session moves to the other
 * storage and the app starts again. Not kept, the cloud's keys kept on disk go too (from
 * then on they are only in memory, see vault.ts).
 */
export async function setKeepSession(keep: boolean) {
  if (!keep) await forgetKeys().catch(() => undefined);
  const session = JSON.stringify({ token: pb.authStore.token, record: pb.authStore.record });
  try {
    if (keep) {
      if (pb.authStore.token) localStorage.setItem(SESSION_KEY, session);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      if (pb.authStore.token) sessionStorage.setItem(SESSION_KEY, session);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Without storage, the session stays where it was.
  }
  writeText(KEEP_KEY, keep ? '1' : '0');
  location.reload();
}
