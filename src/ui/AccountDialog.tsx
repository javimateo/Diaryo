import { Loader2, MailCheck, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  accountError,
  cancelGoogle,
  PASSWORD_MIN,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  useAccount,
} from '../cloud/account';
import { isDesktop } from '../desktop/tauri';
import { useUI, type AccountDialogRequest, type AccountView } from '../store/ui';
import { afterSignIn, continueWithGoogle } from './accountActions';
import { GoogleButton } from './GoogleButton';
import { LegalNote } from './LegalLinks';
import { PasswordField } from './PasswordField';
import { useT } from './useT';

/** What the dialog shows: the forms, and the "check your email" that follows some. */
type View = AccountView | 'verifySent' | 'forgotSent';

/**
 * Signing in to the cloud account or creating it (with Google or with an email), asking
 * for a link to reset the password and choosing the new one (from that link).
 */
export function AccountDialog() {
  const request = useUI((s) => s.accountDialog);
  if (!request) return null;
  return <Dialog request={request} />;
}

function Dialog({ request }: { request: AccountDialogRequest }) {
  const t = useT();
  const a = t.account;
  const setAccountDialog = useUI((s) => s.setAccountDialog);
  const googlePending = useAccount((s) => s.googlePending);
  const googleError = useAccount((s) => s.googleError);
  const [view, setView] = useState<View>(request.view);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (googlePending) cancelGoogle();
    useAccount.setState({ googleError: null });
    setAccountDialog(null);
  };
  const go = (next: View) => {
    setView(next);
    setError('');
    setNotice('');
    useAccount.setState({ googleError: null });
  };

  /** Runs the form's action; its error, if any, stays under the fields. */
  const run = async (action: () => Promise<void>, done: () => void) => {
    setBusy(true);
    setError('');
    try {
      await action();
      done();
    } catch (e) {
      setError(a.errors[accountError(e)] || a.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const needsPassword = view === 'signUp' || view === 'reset';
    if (needsPassword && password.length < PASSWORD_MIN) {
      return setError(a.errors.shortPassword(PASSWORD_MIN));
    }
    if (view === 'signIn') {
      void run(
        async () => {
          await signIn(email, password);
          await afterSignIn();
        },
        () => undefined,
      );
    } else if (view === 'signUp') {
      void run(
        () => signUp(email, password),
        () => go('verifySent'),
      );
    } else if (view === 'forgot') {
      void run(
        () => requestPasswordReset(email),
        () => go('forgotSent'),
      );
    } else if (view === 'reset' && request.token) {
      const token = request.token;
      void run(
        () => resetPassword(token, password),
        () => {
          go('signIn');
          setPassword('');
          setNotice(a.resetDone);
        },
      );
    }
  };

  const titles: Record<View, string> = {
    signIn: a.signInTitle,
    signUp: a.signUpTitle,
    forgot: a.forgotTitle,
    reset: a.resetTitle,
    verifySent: a.verifySentTitle,
    forgotSent: a.forgotSentTitle,
  };

  const emailField = (
    <label className="account-field">
      <span>{a.email}</span>
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        placeholder={a.emailPlaceholder}
        onChange={(e) => setEmail(e.target.value)}
      />
    </label>
  );
  const passwordField = (label: string, autoComplete: string, hint?: string) => (
    <PasswordField
      label={label}
      hint={hint}
      autoFocus={view === 'reset'}
      autoComplete={autoComplete}
      value={password}
      onChange={setPassword}
    />
  );
  const message = (error || (googleError && a.errors[googleError])) && (
    <p className="account-error" role="alert">
      {error || (googleError && a.errors[googleError])}
    </p>
  );
  const primary = (label: string) => (
    <button type="submit" className="account-primary" disabled={busy}>
      {busy && <Loader2 size={15} strokeWidth={2} className="account-spin" aria-hidden />}
      {label}
    </button>
  );
  const link = (label: string, next: View) => (
    <button type="button" className="account-link" onClick={() => go(next)}>
      {label}
    </button>
  );
  const withGoogle = (
    <>
      <GoogleButton
        disabled={busy}
        onClick={() => {
          setError('');
          setNotice('');
          void continueWithGoogle();
        }}
      />
      <div className="account-sep">{a.orEmail}</div>
    </>
  );

  let body: ReactNode;
  if (googlePending) {
    body = (
      <div className="account-waiting" aria-live="polite">
        <Loader2 size={22} strokeWidth={1.75} className="account-spin" aria-hidden />
        <p>{a.googleWaiting(isDesktop())}</p>
        <button type="button" className="settings-btn" onClick={cancelGoogle}>
          {a.cancel}
        </button>
      </div>
    );
  } else if (view === 'verifySent' || view === 'forgotSent') {
    body = (
      <div className="account-sent">
        <MailCheck size={28} strokeWidth={1.5} aria-hidden />
        <p>{view === 'verifySent' ? a.verifySent(email.trim()) : a.forgotSent(email.trim())}</p>
        <button
          type="button"
          className="account-primary"
          autoFocus
          onClick={view === 'verifySent' ? () => void afterSignIn() : () => go('signIn')}
        >
          {view === 'verifySent' ? a.done : a.back}
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {(view === 'signIn' || view === 'signUp') && withGoogle}
        {view === 'forgot' && <p className="account-text">{a.forgotText}</p>}
        {view === 'reset' && <p className="account-text">{a.resetText}</p>}
        {notice && (
          <p className="account-notice" role="status">
            {notice}
          </p>
        )}
        <form className="account-form" onSubmit={submit}>
          {view !== 'reset' && emailField}
          {view === 'signIn' && passwordField(a.password, 'current-password')}
          {view === 'signUp' &&
            passwordField(a.password, 'new-password', a.passwordHint(PASSWORD_MIN))}
          {view === 'reset' &&
            passwordField(a.newPassword, 'new-password', a.passwordHint(PASSWORD_MIN))}
          {message}
          {primary({ signIn: a.signIn, signUp: a.signUp, forgot: a.sendLink, reset: a.save }[view])}
        </form>
        {view === 'signUp' && <p className="account-small">{a.signUpNote}</p>}
        <div className="account-links">
          {view === 'signIn' && (
            <>
              {link(a.forgot, 'forgot')}
              {link(a.noAccount, 'signUp')}
            </>
          )}
          {view === 'signUp' && link(a.haveAccount, 'signIn')}
          {view === 'forgot' && link(a.back, 'signIn')}
          {view === 'reset' && link(a.newLink, 'forgot')}
        </div>
        {(view === 'signIn' || view === 'signUp') && <LegalNote />}
      </>
    );
  }

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <header className="dialog-header">
          <h2 id="account-title">{titles[view]}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="account-body">{body}</div>
      </div>
    </div>
  );
}
