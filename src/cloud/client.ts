import PocketBase, { LocalAuthStore } from 'pocketbase';

/**
 * The cloud server (PocketBase, see docs/cloud.md). `VITE_CLOUD_URL` points to another
 * one (a local server while developing).
 */
export const CLOUD_URL: string =
  import.meta.env.VITE_CLOUD_URL || 'https://cloud.diaryo.javiermateo.dev';

/** The session is remembered on each device (in its local storage). */
export const SESSION_KEY = 'diaryo:cloud-session';

export const pb = new PocketBase(CLOUD_URL, new LocalAuthStore(SESSION_KEY));
