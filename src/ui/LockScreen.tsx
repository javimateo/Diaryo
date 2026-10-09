import { KeyRound, Loader2, LockKeyhole, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accountError, PASSWORD_MIN } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import { eraseDiary, recoverDiary, unlockDiary } from '../cloud/lock';
import { readLock, useLock } from '../cloud/lockState';
import type { DesktopInfo, DesktopMode } from '../desktop/settings';
import { call, isDesktop, listen } from '../desktop/tauri';
import { useUI } from '../store/ui';
import { WindowControls, WindowDragRegion } from './desktop/WindowControls';
import { LockProgress } from './LockDialog';
import { PasswordField } from './PasswordField';
import { useDeskBackground } from './useDeskBackground';
import { useT } from './useT';

/** The diary password allows long phrases. */
const PHRASE_MAX = 200;

type View = 'unlock' | 'recover' | 'forgot';

/**
 * The diary is encrypted on this device and locked: nothing of it is read until the diary
 * password (or the recovery code) opens it. The app itself starts after that.
 */
export function LockScreen() {
  const t = useT();
  const l = t.lock;
  const v = t.vault;
  useDeskBackground();
  useLockedWindow();
  const progress = useLock((s) => s.progress);
  const windowMode = useUI((s) => s.desktop?.mode === 'window');
  const [view, setView] = useState<View>('unlock');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [erasing, setErasing] = useState(false);

  const go = (next: View) => {
    setView(next);
    setError('');
    setErasing(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (view === 'recover') {
      if (password.length < PASSWORD_MIN) {
        return setError(t.account.errors.shortPassword(PASSWORD_MIN));
      }
      if (password !== repeat) return setError(v.errors.mismatch);
    }
    setBusy(true);
    setError('');
    void (async () => {
      try {
        if (view === 'recover') await recoverDiary(code, password);
        else await unlockDiary(password);
      } catch (e) {
        if (e instanceof WrongSecretError) {
          setError(view === 'recover' ? v.errors.wrongCode : v.errors.wrongPassword);
        } else {
          setError(t.account.errors[accountError(e)] || t.account.errors.unknown);
        }
        setBusy(false);
      }
    })();
  };

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { hint?: string; autoFocus?: boolean; autoComplete: string },
  ) => (
    <PasswordField
      label={label}
      hint={options.hint}
      autoFocus={options.autoFocus}
      autoComplete={options.autoComplete}
      maxLength={PHRASE_MAX}
      value={value}
      onChange={(next) => {
        onChange(next);
        setError('');
      }}
    />
  );

  let body: ReactNode;
  if (progress !== null) {
    const opening = readLock()?.rewriting === 'open';
    body = <LockProgress label={opening ? l.decrypting : l.encrypting} />;
  } else if (view === 'forgot') {
    body = (
      <>
        <p className="account-text">{l.forgotText}</p>
        {erasing ? (
          <button
            type="button"
            className="settings-btn lock-erase"
            data-danger-fill=""
            onClick={() => void eraseDiary()}
          >
            <TriangleAlert size={15} strokeWidth={2} aria-hidden /> {l.eraseConfirm}
          </button>
        ) : (
          <button
            type="button"
            className="settings-btn lock-erase"
            data-danger=""
            onClick={() => setErasing(true)}
          >
            {l.erase}
          </button>
        )}
        <div className="account-links">
          <button type="button" className="account-link" onClick={() => go('recover')}>
            {v.back}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="account-text">{view === 'recover' ? v.recoverText : l.lockedText}</p>
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
          {view === 'recover' ? (
            <>
              {field(v.newPassword, password, setPassword, {
                hint: v.passwordHint,
                autoComplete: 'new-password',
              })}
              {field(v.repeat, repeat, setRepeat, { autoComplete: 'new-password' })}
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
            {view === 'recover' ? v.recover : l.open}
          </button>
        </form>
        <div className="account-links">
          {view === 'unlock' ? (
            <button type="button" className="account-link" onClick={() => go('recover')}>
              {v.forgot}
            </button>
          ) : (
            <>
              <button type="button" className="account-link" onClick={() => go('unlock')}>
                {v.back}
              </button>
              <button type="button" className="account-link" onClick={() => go('forgot')}>
                {l.forgotBoth}
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  const titles: Record<View, string> = {
    unlock: l.lockedTitle,
    recover: v.recoverTitle,
    forgot: l.forgotTitle,
  };
  // On the desktop the locked diary can be put away again (Esc, or a click around it).
  const putAway = () => {
    if (isDesktop() && !busy) void call('hide_window');
  };
  return (
    <div
      className="lock-screen"
      onClick={(e) => {
        if (e.target === e.currentTarget) putAway();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') putAway();
      }}
    >
      <WindowDragRegion />
      {windowMode && (
        <div className="layer top-right">
          <div className="top-actions floating">
            <WindowControls />
          </div>
        </div>
      )}
      <div
        className="dialog account-dialog vault-dialog lock-card"
        role="dialog"
        aria-labelledby="lock-screen-title"
      >
        <header className="dialog-header">
          <h2 id="lock-screen-title" className="vault-title">
            {view === 'unlock' ? (
              <LockKeyhole size={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <KeyRound size={18} strokeWidth={1.75} aria-hidden />
            )}
            {titles[view]}
          </h2>
        </header>
        <div className="account-body">{body}</div>
      </div>
    </div>
  );
}

/**
 * On the desktop, the locked window still answers the desktop side: it is shown in its
 * mode, put away and quit (the diary's own bridge only starts once it is open).
 */
function useLockedWindow() {
  useEffect(() => {
    if (!isDesktop()) return;
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const applyMode = (mode: DesktopMode) => {
      document.documentElement.toggleAttribute('data-widget', mode === 'widget');
      useUI.getState().setDesktop({ mode });
    };
    void (async () => {
      const info = await call<DesktopInfo>('desktop_info');
      useUI.getState().setDesktop(info);
      applyMode(info.mode);
      const unlisten = await Promise.all([
        listen<DesktopMode>('diaryo://mode', (mode) => {
          applyMode(mode);
          void call('frontend_ready');
        }),
        // Shown in a mode it may have missed (it was loading): it catches up.
        listen<DesktopMode>('diaryo://shown', (mode) => applyMode(mode)),
        listen<number>('diaryo://closing', (shows) => void call('hide_window', { shows })),
        listen('diaryo://quit', () => void call('quit_app')),
      ]);
      cleanups.push(...unlisten);
      if (stopped) cleanups.splice(0).forEach((cleanup) => cleanup());
      else void call('frontend_ready');
    })();
    return () => {
      stopped = true;
      cleanups.splice(0).forEach((cleanup) => cleanup());
    };
  }, []);
}
