import { Eye, KeyRound, Loader2, LockKeyhole, LockKeyholeOpen, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accountError, PASSWORD_MIN, useAccount } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import {
  changeLockPassword,
  disableLock,
  enableLock,
  newLockRecoveryCode,
  privateNotes,
  recoverDiary,
  revealNotes,
} from '../cloud/lock';
import { useLock } from '../cloud/lockState';
import { useUI, type LockDialogRequest, type LockView } from '../store/ui';
import { PasswordField } from './PasswordField';
import { useT } from './useT';
import { RecoveryCode } from './VaultDialog';

/** The diary password allows long phrases. */
const PHRASE_MAX = 200;

/** Inside the dialog, besides what it was opened for: recovering with the code. */
type View = LockView | 'recover';

/**
 * The diary password on this device: setting it for the private notes or the whole diary
 * (the cloud's diary password, or a new one and its recovery code), lowering that,
 * showing the private notes and, without an account, changing the password or making a
 * new recovery code.
 */
export function LockDialog() {
  const request = useUI((s) => s.lockDialog);
  if (!request) return null;
  return <Dialog request={request} />;
}

function Dialog({ request }: { request: LockDialogRequest }) {
  const t = useT();
  const l = t.lock;
  const v = t.vault;
  const setLockDialog = useUI((s) => s.setLockDialog);
  const showToast = useUI((s) => s.showToast);
  const level = useLock((s) => s.level);
  // Signed in with a cloud diary and no password here yet: its password is the one.
  const cloud = useAccount((s) => !!s.account && (s.vault === 'locked' || s.vault === 'unlocked'));
  const [view, setView] = useState<View>(request.view);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Turning it off: how many private notes there are, and what happens to them. */
  const [notes, setNotes] = useState(0);
  const [release, setRelease] = useState<'open' | 'delete'>('open');

  useEffect(() => {
    if (request.view === 'off') void privateNotes().then(setNotes);
  }, [request.view]);

  // A new password is chosen when there is none here (nor in the cloud), when changing it
  // and when recovering.
  const fresh = level === 'off' && !cloud;
  const choosing =
    ((view === 'private' || view === 'all') && fresh) || view === 'change' || view === 'recover';
  // Encrypting or decrypting the whole diary takes a while: its progress shows.
  const rewriting =
    (view === 'all' || view === 'down' || (view === 'off' && level === 'all')) && busy;

  const close = () => {
    if (busy || (shownCode && !saved)) return;
    setLockDialog(null);
  };
  const finish = (message: string) => {
    setLockDialog(null);
    showToast(message);
    request.then?.();
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
        if (view === 'private' || view === 'all') {
          const shows = view === 'private' && Array.isArray(request.notes) ? request.notes : [];
          const made = await enableLock(password, view, shows);
          if (made) setShownCode(made);
          else finish(view === 'private' ? l.privateDone : l.enabled);
        } else if (view === 'down') {
          await disableLock(password, 'private');
          finish(l.downDone);
        } else if (view === 'off') {
          await disableLock(password, 'off', release);
          finish(l.disabled);
        } else if (view === 'reveal') {
          await revealNotes(password, request.notes ?? 'all');
          finish(l.revealed);
        } else if (view === 'delete') {
          // The password is checked by showing them, just before they go.
          await revealNotes(password, request.notes ?? []);
          setLockDialog(null);
          request.then?.();
        } else if (view === 'recover') {
          await recoverDiary(code, password, request.notes ?? 'all');
          finish(l.revealed);
        } else if (view === 'change') {
          await changeLockPassword(current, password);
          finish(v.changed);
        } else {
          setShownCode(await newLockRecoveryCode(password));
        }
      } catch (e) {
        if (e instanceof WrongSecretError) {
          setError(view === 'recover' ? v.errors.wrongCode : v.errors.wrongPassword);
        } else setError(t.account.errors[accountError(e)] || t.account.errors.unknown);
      } finally {
        setBusy(false);
      }
    })();
  };

  // Showing (or deleting) these private notes: a single one, or how many.
  const count = Array.isArray(request.notes) ? request.notes.length : 0;
  const one = count === 1;
  const titles: Record<View, string> = {
    private: l.privateTitle,
    all: l.enableTitle,
    down: l.downTitle,
    off: l.offTitle,
    reveal: one ? l.showThis : l.revealTitle,
    delete: l.deleteTitle(count),
    recover: v.recoverTitle,
    change: v.changeTitle,
    newCode: v.newCodeTitle,
  };
  const intros: Record<View, string> = {
    private: fresh ? l.privateText : l.privateCloudText,
    all: fresh ? l.enableText : l.enableCloudText,
    down: l.downText,
    off: l.offText,
    reveal: one ? l.revealOneText : l.revealText,
    delete: l.deleteText(count),
    recover: v.recoverText,
    change: '',
    newCode: v.newCodeText,
  };
  const submits: Record<View, string> = {
    private: v.next,
    all: l.enable,
    down: l.down,
    off: l.off,
    reveal: l.reveal,
    delete: l.delete,
    recover: v.recover,
    change: v.change,
    newCode: v.makeCode,
  };
  const icon =
    view === 'off' || view === 'down' ? (
      <LockKeyholeOpen size={18} strokeWidth={1.75} aria-hidden />
    ) : view === 'reveal' ? (
      <Eye size={18} strokeWidth={1.75} aria-hidden />
    ) : view === 'delete' ? (
      <Trash2 size={18} strokeWidth={1.75} aria-hidden />
    ) : view === 'newCode' || view === 'recover' || shownCode ? (
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
        onFinish={() =>
          finish(view === 'private' ? l.privateDone : view === 'all' ? l.enabled : v.done)
        }
      />
    );
  } else if (rewriting) {
    body = <LockProgress label={view === 'all' ? l.encrypting : l.decrypting} />;
  } else {
    body = (
      <>
        {intros[view] && <p className="account-text">{intros[view]}</p>}
        {view === 'off' && notes > 0 && (
          <fieldset className="lock-release">
            <legend className="account-text">{l.offNotes(notes)}</legend>
            {(
              [
                [
                  'open',
                  l.keepNotes(notes),
                  l.keepNotesHint,
                  <Eye key="i" size={18} strokeWidth={1.75} />,
                ],
                [
                  'delete',
                  l.deleteNotes(notes),
                  l.deleteNotesHint(notes),
                  <Trash2 key="i" size={18} strokeWidth={1.75} />,
                ],
              ] as const
            ).map(([id, label, hint, glyph]) => (
              <label
                key={id}
                className="open-copy-option"
                data-primary={release === id || undefined}
              >
                <input
                  type="radio"
                  name="release"
                  checked={release === id}
                  onChange={() => setRelease(id)}
                />
                {glyph}
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <form className="account-form" onSubmit={submit}>
          {view === 'recover' && (
            <label className="account-field">
              <span>{v.code}</span>
              <input
                className="vault-code-input"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-…"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError('');
                }}
              />
            </label>
          )}
          {view === 'change' &&
            field(v.current, current, setCurrent, {
              autoFocus: true,
              autoComplete: 'current-password',
            })}
          {choosing ? (
            <>
              {field(
                view === 'private' || view === 'all' ? v.password : v.newPassword,
                password,
                setPassword,
                {
                  autoFocus: view === 'private' || view === 'all',
                  hint: v.passwordHint,
                },
              )}
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
        {(view === 'reveal' || view === 'recover') && (
          <div className="account-links">
            <button
              type="button"
              className="account-link"
              onClick={() => {
                setView(view === 'reveal' ? 'recover' : 'reveal');
                setError('');
              }}
            >
              {view === 'reveal' ? v.forgot : v.back}
            </button>
          </div>
        )}
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
