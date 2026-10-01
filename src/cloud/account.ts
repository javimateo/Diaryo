import { ClientResponseError, type RecordModel } from 'pocketbase';
import { create } from 'zustand';
import { pb } from './client';

/** The signed-in account, as the app shows it. */
export interface Account {
  id: string;
  email: string;
  /** The email was confirmed (with Google, always). */
  verified: boolean;
  plan: string;
  quotaBytes: number;
}

/** The account's password: PocketBase asks for 8 to 71 characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 71;

const toAccount = (record: RecordModel | null): Account | null =>
  record && pb.authStore.isValid
    ? {
        id: record.id,
        email: String(record.email ?? ''),
        verified: Boolean(record.verified),
        plan: String(record.plan || 'free'),
        quotaBytes: Number(record.quotaBytes ?? 0),
      }
    : null;

/**
 * The cloud diary on this device: not known yet (or without a connection), no vault yet
 * (the first device sets it up), locked (the password is needed here) or unlocked.
 */
export type VaultState = 'unknown' | 'none' | 'locked' | 'unlocked';

interface AccountState {
  account: Account | null;
  vault: VaultState;
  /** Waiting for Google (in a popup on the web, in the browser on the desktop). */
  googlePending: boolean;
  /** Why the last attempt with Google failed (not when it was cancelled). */
  googleError: AccountError | null;
}

export const useAccount = create<AccountState>(() => ({
  account: toAccount(pb.authStore.record),
  vault: 'unknown',
  googlePending: false,
  googleError: null,
}));

pb.authStore.onChange((_, record) => useAccount.setState({ account: toAccount(record) }));

const users = () => pb.collection('users');

export async function signIn(email: string, password: string) {
  await users().authWithPassword(email.trim(), password, { requestKey: null });
}

/** Creates the account, signs in and sends the email to confirm it. */
export async function signUp(email: string, password: string) {
  email = email.trim();
  await users().create(
    { email, password, passwordConfirm: password, emailVisibility: false },
    { requestKey: null },
  );
  await signIn(email, password);
  // If the email doesn't go out now, it can be sent again from the settings.
  await users()
    .requestVerification(email, { requestKey: null })
    .catch((error) => console.error("Couldn't send the confirmation email", error));
}

const GOOGLE = 'google-sign-in';

/**
 * Signs in (or up) with Google. On the web, call it straight from the click (it opens a
 * popup); with `openUrl`, Google opens there instead (the browser, on the desktop) and
 * the server tells the app when it's done.
 */
export async function signInWithGoogle(openUrl?: (url: string) => Promise<void> | void) {
  useAccount.setState({ googlePending: true, googleError: null });
  try {
    await users().authWithOAuth2({ provider: 'google', requestKey: GOOGLE, urlCallback: openUrl });
  } catch (error) {
    const kind = accountError(error);
    useAccount.setState({ googleError: kind === 'cancelled' ? null : kind });
    throw error;
  } finally {
    useAccount.setState({ googlePending: false });
  }
}

/** Stops waiting for Google. */
export const cancelGoogle = () => pb.cancelRequest(GOOGLE);

export const signOut = () => pb.authStore.clear();

export async function requestPasswordReset(email: string) {
  await users().requestPasswordReset(email.trim(), { requestKey: null });
}

export async function resetPassword(token: string, password: string) {
  await users().confirmPasswordReset(token, password, password, { requestKey: null });
}

/** Sends the email to confirm the account's email again. */
export async function resendVerification() {
  const email = useAccount.getState().account?.email;
  if (email) await users().requestVerification(email, { requestKey: null });
}

/** Confirms the email with the link's token (and, if it's this account, catches up). */
export async function confirmVerification(token: string) {
  await users().confirmVerification(token, { requestKey: null });
  await refreshAccount();
}

/**
 * Renews the session and brings the account up to date (the email confirmed on another
 * device, the plan…). If the server no longer accepts it, the session ends; without a
 * connection, it stays as it was.
 */
export async function refreshAccount() {
  if (!pb.authStore.token) return;
  if (!pb.authStore.isValid) return pb.authStore.clear();
  try {
    await users().authRefresh({ requestKey: null });
  } catch (error) {
    const status = error instanceof ClientResponseError ? error.status : 0;
    if (status === 401 || status === 403 || status === 404) pb.authStore.clear();
  }
}

/** What went wrong, for the message the user sees. */
export type AccountError =
  | 'offline'
  | 'cancelled'
  | 'credentials'
  | 'emailTaken'
  | 'invalidEmail'
  | 'invalidLink'
  | 'tooMany'
  | 'unknown';

export function accountError(error: unknown): AccountError {
  if (!(error instanceof ClientResponseError)) return 'unknown';
  if (error.isAbort) return 'cancelled';
  // Without an answer: the connection failed (fetch's TypeError) or something else did.
  if (error.status === 0) return error.originalError instanceof TypeError ? 'offline' : 'unknown';
  if (error.status === 429) return 'tooMany';
  const fields = (error.response?.data ?? {}) as Record<string, { code?: string } | undefined>;
  if (fields.token) return 'invalidLink';
  if (fields.email?.code === 'validation_not_unique') return 'emailTaken';
  if (fields.email) return 'invalidEmail';
  if (error.status === 400 && error.url.includes('auth-with-password')) return 'credentials';
  return 'unknown';
}
