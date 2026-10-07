import { KeyRound, Loader2, LockKeyhole, LockKeyholeOpen, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { accountError, PASSWORD_MIN, useAccount } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import { changeLockPassword, disableLock, enableLock, newLockRecoveryCode } from '../cloud/lock';
import { useLock } from '../cloud/lockState';
import { useUI, type LockView } from '../store/ui';
import { PasswordField } from './PasswordField';
import { useT } from './useT';
import { RecoveryCode } from './VaultDialog';

/** The diary password allows long phrases. */
const PHRASE_MAX = 200;

/**
 * The diary encrypted on this device: turning it on (with the cloud's diary password, or
 * a new one and its recovery code) or off, and, without an account, changing its password
 * or making a new recovery code.
 */
export function LockDialog() {
  const view = useUI((s) => s.lockDialog);
  if (!view) return null;
  return <Dialog view={view} />;
}

function Dialog({ view }: { view: LockView }) {
  const t = useT();
  const l = t.lock;
  const v = t.vault;
  const setLockDialog = useUI((s) => s.setLockDialog);
  const showToast = useUI((s) => s.showToast);
  // Signed in with a cloud diary: its password is the one.
  const cloud = useAccount((s) => !!s.account && (s.vault === 'locked' || s.vault === 'unlocked'));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const choosing = (view === 'enable' && !cloud) || view === 'change';
  const close = () => {
    if (busy || (shownCode && !saved)) return;
    setLockDialog(null);
  };
  const finish = (message: string) => {
    setLockDialog(null);
    showToast(message);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (choosing && password.length < PASSWORD_MIN) {
      return setError(t.account.errors.shortPassword(PASSWORD_MIN));
    }
    if (choosing && password !== repeat) return setError(v.errors.mismatch);
    setBusy(true);
    setError('');
    void (async () => {
      try {
        if (view === 'enable') {
          const code = await enableLock(password);
          if (code) setShownCode(code);
          else finish(l.enabled);
        } else if (view === 'disable') {
          await disableLock(password);
          finish(l.disabled);
        } else if (view === 'change') {
          await changeLockPassword(current, password);
          finish(v.changed);
        } else {
          setShownCode(await newLockRecoveryCode(password));
        }
      } catch (e) {
        if (e instanceof WrongSecretError) setError(v.errors.wrongPassword);
        else setError(t.account.errors[accountError(e)] || t.account.errors.unknown);
      } finally {
        setBusy(false);
      }
    })();
  };

  const titles: Record<LockView, string> = {
    enable: l.enableTitle,
    disable: l.disableTitle,
    change: v.changeTitle,
    newCode: v.newCodeTitle,
  };
  const intros: Record<LockView, string> = {
    enable: cloud ? l.enableCloudText : l.enableText,
    disable: l.disableText,
    change: '',
    newCode: v.newCodeText,
  };
  const submits: Record<LockView, string> = {
    enable: l.enable,
    disable: l.disable,
    change: v.change,
    newCode: v.makeCode,
  };
  const icon =
    view === 'disable' ? (
      <LockKeyholeOpen size={18} strokeWidth={1.75} aria-hidden />
    ) : view === 'newCode' || shownCode ? (
      <KeyRound size={18} strokeWidth={1.75} aria-hidden />
    ) : (
      <LockKeyhole size={18} strokeWidth={1.75} aria-hidden />
    );

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { hint?: string; autoFocus?: boolean; autoComplete?: string } = {},
  ) => (
    <PasswordField
      label={label}
      hint={options.hint}
      autoFocus={options.autoFocus}
      autoComplete={options.autoComplete ?? 'new-password'}
      maxLength={PHRASE_MAX}
      value={value}
      onChange={(next) => {
        onChange(next);
        setError('');
      }}
    />
  );

  let body: ReactNode;
  if (shownCode) {
    body = (
      <RecoveryCode
        local
        code={shownCode}
        saved={saved}
        onSaved={setSaved}
        finishLabel={v.done}
        onFinish={() => finish(view === 'enable' ? l.enabled : v.done)}
      />
    );
  } else if (busy && (view === 'enable' || view === 'disable')) {
    body = <LockProgress label={view === 'enable' ? l.encrypting : l.decrypting} />;
  } else {
    body = (
      <>
        {intros[view] && <p className="account-text">{intros[view]}</p>}
        <form className="account-form" onSubmit={submit}>
          {view === 'change' &&
            field(v.current, current, setCurrent, {
              autoFocus: true,
              autoComplete: 'current-password',
            })}
          {choosing ? (
            <>
              {field(view === 'change' ? v.newPassword : v.password, password, setPassword, {
                autoFocus: view !== 'change',
                hint: v.passwordHint,
              })}
              {field(v.repeat, repeat, setRepeat)}
            </>
          ) : (
            field(v.password, password, setPassword, {
              autoFocus: true,
              autoComplete: 'current-password',
            })
          )}
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="account-primary" disabled={busy}>
            {busy && <Loader2 size={15} strokeWidth={2} className="account-spin" aria-hidden />}
            {submits[view]}
          </button>
        </form>
      </>
    );
  }

  const fixed = busy || (!!shownCode && !saved);
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog account-dialog vault-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <header className="dialog-header">
          <h2 id="lock-title" className="vault-title">
            {icon}
            {shownCode ? v.codeTitle : titles[view]}
          </h2>
          {!fixed && (
            <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </header>
        <div className="account-body">{body}</div>
      </div>
    </div>
  );
}

/** How far encrypting or decrypting the whole diary got. */
export function LockProgress({ label }: { label: string }) {
  const t = useT();
  const progress = useLock((s) => s.progress) ?? 0;
  return (
    <div className="lock-progress" role="status">
      <p className="account-text">{label}</p>
      <div
        className="lock-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="settings-note">{t.lock.keepOpen}</p>
    </div>
  );
}
