import {
  KeyRound,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Mail,
  PenLine,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  accountError,
  refreshAccount,
  resendVerification,
  signOut,
  useAccount,
} from '../cloud/account';
import { forgetDevice } from '../cloud/vault';
import { isDesktop } from '../desktop/tauri';
import { useUI, type SyncMode, type VaultView } from '../store/ui';
import { continueWithGoogle } from './accountActions';
import { Choice } from './Choice';
import { syncNow, useSync } from './cloudSync';
import { relativeTime } from './relativeTime';
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
      <SyncRows />
    </section>
  );
}

/** The cloud diary's encryption on this device: set it up, unlock it, or manage it. */
function VaultRows() {
  const t = useT();
  const v = t.vault;
  const vault = useAccount((s) => s.vault);
  const asksEachTime = useUI((s) => s.settings.syncMode === 'password') && vault === 'locked';
  const setVaultDialog = useUI((s) => s.setVaultDialog);
  const open = (view: VaultView) => setVaultDialog({ view, fromSettings: true });

  if (vault === 'unlocked' || asksEachTime) {
    return (
      <>
        <SettingsRow label={v.section}>
          {asksEachTime ? (
            <span className="settings-label">
              <small>{t.sync.passwordMode}</small>
            </span>
          ) : (
            <span className="settings-ok">
              <LockKeyhole size={15} strokeWidth={2} /> {v.stateUnlocked(isDesktop())}
            </span>
          )}
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

const MODES: SyncMode[] = ['auto', 'manual', 'password'];

/** How the cloud diary syncs here, how it is going, and the space it takes. */
function SyncRows() {
  const t = useT();
  const s = t.sync;
  const vault = useAccount((state) => state.vault);
  const mode = useUI((state) => state.settings.syncMode);
  const setSettings = useUI((state) => state.setSettings);
  const setVaultDialog = useUI((state) => state.setVaultDialog);
  const { status, lastSync, progress, pending, usage, rejected } = useSync();
  if (vault !== 'unlocked' && !(mode === 'password' && vault === 'locked')) return null;

  const changeMode = (next: SyncMode) => {
    if (next === mode) return;
    setSettings({ syncMode: next });
    // With the password each time, this device stops keeping the keys…
    if (next === 'password') void forgetDevice();
    // …and leaving that mode needs them again.
    else if (useAccount.getState().vault !== 'unlocked') {
      setVaultDialog({ view: 'unlock', fromSettings: true });
    }
  };

  const syncing = status === 'syncing';
  let line: string;
  if (syncing) line = progress ? s.progress(progress.done, progress.total) : s.status.syncing;
  else if (status === 'idle') line = lastSync ? s.last(relativeTime(lastSync)) : s.never;
  else if (status === 'error' && rejected > 0) line = s.rejected(rejected);
  else line = s.status[status];
  const share = usage && usage.quota > 0 ? Math.min(1, usage.used / usage.quota) : 0;

  return (
    <>
      <SettingsRow label={s.row} hint={s.modeHints[mode]}>
        <Choice options={MODES.map((id) => [id, s.modes[id]])} value={mode} onChange={changeMode} />
      </SettingsRow>
      <div className="sync-line">
        <span className="settings-label">
          <small>
            {line}
            {pending > 0 && !syncing && status !== 'full' && ` · ${s.pending(pending)}`}
          </small>
        </span>
        <button
          type="button"
          className="settings-btn"
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          <RefreshCw
            size={15}
            strokeWidth={1.75}
            className={syncing ? 'account-spin' : undefined}
          />
          {s.now}
        </button>
      </div>
      {progress && (
        <div className="sync-bar" aria-hidden>
          <i
            style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
          />
        </div>
      )}
      {status !== 'full' && usage && share >= 0.8 && (
        <div className="sync-full" data-tone="low" role="status">
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
          <p>{s.lowSpace(formatBytes(Math.max(0, usage.quota - usage.used)))}</p>
        </div>
      )}
      {status === 'full' && (
        <div className="sync-full" role="alert">
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
          <p>
            <strong>{s.fullTitle}</strong> {s.fullText}
            {pending > 0 && <> {s.pending(pending)}.</>}
          </p>
        </div>
      )}
      {usage && (
        <div className="sync-space">
          <span className="settings-label">
            <span>{s.space}</span>
          </span>
          <small>{s.spaceOf(formatBytes(usage.used), formatBytes(usage.quota))}</small>
          <div
            className="sync-bar"
            data-full={share >= 0.95 || status === 'full' || undefined}
            data-low={share >= 0.8 || undefined}
            aria-hidden
          >
            <i style={{ width: `${Math.max(share * 100, usage.used > 0 ? 1 : 0)}%` }} />
          </div>
        </div>
      )}
    </>
  );
}
