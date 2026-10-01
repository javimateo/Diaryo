import { KeyRound, LockKeyhole, LockKeyholeOpen, LogOut, Mail, PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  accountError,
  refreshAccount,
  resendVerification,
  signOut,
  useAccount,
} from '../cloud/account';
import { isDesktop } from '../desktop/tauri';
import { useUI, type VaultView } from '../store/ui';
import { continueWithGoogle } from './accountActions';
import { formatBytes } from './formatBytes';
import { GoogleButton } from './GoogleButton';
import { SettingsRow } from './SettingsRow';
import { useT } from './useT';

/** The settings' "Account and cloud": sign in, or the account and signing out. */
export function AccountSection() {
  const t = useT();
  const account = useAccount((s) => s.account);
  const setAccountDialog = useUI((s) => s.setAccountDialog);
  const showToast = useUI((s) => s.showToast);
  const [sending, setSending] = useState(false);

  // The email may have been confirmed somewhere else meanwhile.
  useEffect(() => void refreshAccount(), []);

  const signInDialog = () => setAccountDialog({ view: 'signIn', fromSettings: true });

  if (!account) {
    return (
      <section className="settings-section">
        <h3>{t.account.section}</h3>
        <p className="settings-note account-intro">{t.account.intro}</p>
        <div className="account-start">
          <GoogleButton
            onClick={() => {
              void continueWithGoogle();
              signInDialog();
            }}
          />
          <button type="button" className="account-primary" onClick={signInDialog}>
            {t.account.signInOrUp}
          </button>
        </div>
      </section>
    );
  }

  const resend = async () => {
    setSending(true);
    try {
      await resendVerification();
      showToast(t.account.resent);
    } catch (error) {
      showToast(t.account.errors[accountError(error)] || t.account.errors.unknown);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="settings-section">
      <h3>{t.account.section}</h3>
      <div className="account-card">
        <span className="account-avatar" aria-hidden>
          {account.email.charAt(0).toUpperCase()}
        </span>
        <span className="account-who">
          <strong>{account.email}</strong>
          <small>
            {t.account.plans[account.plan] ?? account.plan} ·{' '}
            {t.account.planOf(formatBytes(account.quotaBytes))}
          </small>
        </span>
        <button
          type="button"
          className="settings-btn"
          onClick={() => {
            signOut();
            showToast(t.account.signedOut);
          }}
        >
          <LogOut size={15} strokeWidth={1.75} /> {t.account.signOut}
        </button>
      </div>
      {!account.verified && (
        <SettingsRow label={t.account.unverified} hint={t.account.unverifiedHint}>
          <button
            type="button"
            className="settings-btn"
            disabled={sending}
            onClick={() => void resend()}
          >
            <Mail size={15} strokeWidth={1.75} /> {t.account.resend}
          </button>
        </SettingsRow>
      )}
      <VaultRows />
      <p className="settings-note">{t.account.syncSoon}</p>
    </section>
  );
}

/** The cloud diary's encryption on this device: set it up, unlock it, or manage it. */
function VaultRows() {
  const t = useT();
  const v = t.vault;
  const vault = useAccount((s) => s.vault);
  const setVaultDialog = useUI((s) => s.setVaultDialog);
  const open = (view: VaultView) => setVaultDialog({ view, fromSettings: true });

  if (vault === 'unlocked') {
    return (
      <>
        <SettingsRow label={v.section}>
          <span className="settings-ok">
            <LockKeyhole size={15} strokeWidth={2} /> {v.stateUnlocked(isDesktop())}
          </span>
        </SettingsRow>
        <SettingsRow label={v.passwordRow}>
          <button type="button" className="settings-btn" onClick={() => open('change')}>
            <PenLine size={15} strokeWidth={1.75} /> {v.change}
          </button>
        </SettingsRow>
        <SettingsRow label={v.codeRow}>
          <button type="button" className="settings-btn" onClick={() => open('newCode')}>
            <KeyRound size={15} strokeWidth={1.75} /> {v.newCode}
          </button>
        </SettingsRow>
      </>
    );
  }
  if (vault === 'none' || vault === 'locked') {
    const none = vault === 'none';
    return (
      <SettingsRow label={v.section} hint={none ? v.stateNone : v.stateLocked}>
        <button
          type="button"
          className="settings-btn"
          onClick={() => open(none ? 'create' : 'unlock')}
        >
          {none ? (
            <LockKeyhole size={15} strokeWidth={1.75} />
          ) : (
            <LockKeyholeOpen size={15} strokeWidth={1.75} />
          )}
          {none ? v.setUp : v.unlock}
        </button>
      </SettingsRow>
    );
  }
  return <p className="settings-note">{v.stateUnknown}</p>;
}
