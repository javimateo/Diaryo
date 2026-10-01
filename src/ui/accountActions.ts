import {
  accountError,
  confirmVerification,
  refreshAccount,
  signInWithGoogle,
  useAccount,
} from '../cloud/account';
import { readAccountLink } from '../cloud/links';
import { call, isDesktop } from '../desktop/tauri';
import { t } from '../i18n';
import { useUI } from '../store/ui';

/** How often the session is renewed while the app stays open. */
const REFRESH_EVERY = 12 * 60 * 60 * 1000;

/**
 * Continue with Google. Call it straight from the click: on the web it opens a popup
 * (the browser only allows that right after a click); on the desktop, the browser.
 * Errors are left in `googleError` for the account dialog.
 */
export async function continueWithGoogle() {
  const openUrl = isDesktop() ? (url: string) => call('open_sign_in', { url }) : undefined;
  try {
    await signInWithGoogle(openUrl);
  } catch {
    return;
  }
  const { setAccountDialog, showToast } = useUI.getState();
  setAccountDialog(null);
  const email = useAccount.getState().account?.email;
  if (email) showToast(t().account.signedIn(email));
}

/**
 * Opened from an email's link (on the web): confirms the email or asks for the new
 * password. The link leaves the address at once, so a reload doesn't use it again.
 */
async function openAccountLink() {
  const link = readAccountLink(location.search);
  if (!link) return;
  const url = new URL(location.href);
  url.searchParams.delete(link.kind);
  history.replaceState(history.state, '', url);

  const { setAccountDialog, showToast } = useUI.getState();
  if (link.kind === 'reset') return setAccountDialog({ view: 'reset', token: link.token });
  try {
    await confirmVerification(link.token);
    showToast(t().account.verified);
  } catch (error) {
    showToast(t().account.errors[accountError(error) === 'offline' ? 'offline' : 'invalidLink']);
  }
}

/** When the app starts: the email's links, and the session renewed now and then. */
export function startAccount() {
  void openAccountLink();
  void refreshAccount();
  const timer = window.setInterval(() => void refreshAccount(), REFRESH_EVERY);
  return () => window.clearInterval(timer);
}
