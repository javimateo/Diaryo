import { BookPlus, KeyRound, LockKeyhole, LogOut, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accountError, signOut, useAccount } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import { eraseDiary, recoverDiary, unlockDiary } from '../cloud/lock';
import { readLock, useLock } from '../cloud/lockState';
import type { DesktopInfo, DesktopMode } from '../desktop/settings';
import { call, isDesktop, listen } from '../desktop/tauri';
import { coverImage, getDB } from '../storage/db';
import { useUI } from '../store/ui';
import { keepLockedDiary } from './fileActions';
import { WindowControls, WindowDragRegion } from './desktop/WindowControls';
import { LockProgress } from './LockDialog';
import { FormError, phraseFields, RecoveryCodeField, SubmitButton } from './passwordForm';
import { newPasswordError } from './passwordRules';
import { useDeskBackground } from './useDeskBackground';
import { useT } from './useT';

type View = 'unlock' | 'recover' | 'forgot' | 'options' | 'startOver';

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
  /** The locked diary's file was downloaded (web): erasing waits for the user to say so. */
  const [downloaded, setDownloaded] = useState(false);
  const email = useAccount((s) => s.account?.email ?? null);
  const cover = useCoverPicture();

  const go = (next: View) => {
    setView(next);
    setError('');
    setErasing(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const wrong = view === 'recover' && newPasswordError(password, repeat, t);
    if (wrong) return setError(wrong);
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

  const field = phraseFields(() => setError(''));

  let body: ReactNode;
  if (progress !== null) {
    const opening = readLock()?.rewriting === 'open';
    body = <LockProgress label={opening ? l.decrypting : l.encrypting} />;
  } else if (view === 'options') {
    body = (
      <>
        <p className="account-text">{l.optionsText}</p>
        <div className="lock-options">
          {email && (
            <button type="button" className="lock-option" onClick={() => signOut()}>
              <LogOut size={17} strokeWidth={1.75} aria-hidden />
              <strong>{l.signOut}</strong>
              <small>{l.signOutHint(email)}</small>
            </button>
          )}
          <button type="button" className="lock-option" onClick={() => go('startOver')}>
            <BookPlus size={17} strokeWidth={1.75} aria-hidden />
            <strong>{l.startOver}</strong>
            <small>{l.startOverHint}</small>
          </button>
          <button
            type="button"
            className="lock-option"
            data-danger=""
            onClick={() => setErasing(true)}
          >
            <Trash2 size={17} strokeWidth={1.75} aria-hidden />
            <strong>{l.erase}</strong>
            <small>{l.eraseHint}</small>
          </button>
        </div>
        {erasing && (
          <button
            type="button"
            className="settings-btn lock-erase"
            data-danger-fill=""
            onClick={() => void eraseDiary()}
          >
            <TriangleAlert size={15} strokeWidth={2} aria-hidden /> {l.eraseConfirm}
          </button>
        )}
        <div className="account-links">
          <button type="button" className="account-link" onClick={() => go('unlock')}>
            {v.back}
          </button>
        </div>
      </>
    );
  } else if (view === 'startOver') {
    // On the desktop the copy is written before going on. On the web it is a download,
    // which the browser may still be saving (or asking where): the diary is only erased
    // once the user says the file is there.
    const desktop = isDesktop();
    const keep = (then?: () => Promise<void>) => {
      setBusy(true);
      setError('');
      keepLockedDiary()
        .then(async () => {
          if (then) await then();
          else setDownloaded(true);
          setBusy(false);
        })
        .catch((e: unknown) => {
          console.error("Couldn't keep the locked diary", e);
          setError(l.startOverFailed);
          setBusy(false);
        });
    };
    const waiting = !desktop && downloaded;
    body = (
      <>
        <p className="account-text">{waiting ? l.startOverCheck : l.startOverText(desktop)}</p>
        <p className="account-text">{l.startOverOpen}</p>
        <FormError message={error} />
        <SubmitButton
          busy={busy}
          onClick={() => (waiting ? void eraseDiary() : keep(desktop ? eraseDiary : undefined))}
        >
          {waiting ? l.startOverConfirm : desktop ? l.startOverButton : l.startOverDownload}
        </SubmitButton>
        <div className="account-links">
          {waiting && (
            <button type="button" className="account-link" disabled={busy} onClick={() => keep()}>
              {l.startOverAgain}
            </button>
          )}
          <button type="button" className="account-link" onClick={() => go('options')}>
            {v.back}
          </button>
        </div>
      </>
    );
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
            <RecoveryCodeField
              value={code}
              onChange={(next) => {
                setCode(next);
                setError('');
              }}
            />
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
          <FormError message={error} />
          <SubmitButton busy={busy}>{view === 'recover' ? v.recover : l.open}</SubmitButton>
        </form>
        <div className="account-links">
          {view === 'unlock' ? (
            <>
              <button type="button" className="account-link" onClick={() => go('recover')}>
                {v.forgot}
              </button>
              <button type="button" className="account-link" onClick={() => go('options')}>
                {l.otherOptions}
              </button>
            </>
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
    options: l.otherOptions,
    startOver: l.startOver,
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
      <div className="lock-stage">
        {cover && <img className="lock-cover" src={cover} alt="" draggable={false} />}
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
    </div>
  );
}

/**
 * The diary's cover, closed: the one picture of it kept readable while it is locked (see
 * sealing.ts), so the diary is recognised without showing anything inside.
 */
function useCoverPicture(): string | null {
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    coverImage(getDB())
      .then((image) => live && setPicture(image))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return picture;
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
