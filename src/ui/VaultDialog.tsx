import { KeyRound, LockKeyhole, LockKeyholeOpen, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { accountError } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import {
  changeVaultPassword,
  hasOwnVault,
  PrivateHiddenError,
  recover,
  replaceRecoveryCode,
  setUpVault,
  unlock,
  unlockOnce,
  VaultChangedError,
  VaultExistsError,
} from '../cloud/vault';
import { useUI, type VaultDialogRequest, type VaultView } from '../store/ui';
import { syncNow } from './cloudSync';
import { FormError, phraseFields, RecoveryCodeField, SubmitButton } from './passwordForm';
import { newPasswordError } from './passwordRules';
import { RecoveryCode } from './RecoveryCode';
import { useT } from './useT';

/**
 * The cloud diary's password and recovery code: setting them up on the first device,
 * unlocking the others, recovering with the code, changing the password and making a
 * new code. The recovery code is shown once, and the dialog doesn't close until it is
 * saved.
 */
export function VaultDialog() {
  const request = useUI((s) => s.vaultDialog);
  if (!request) return null;
  return <Dialog request={request} />;
}

function Dialog({ request }: { request: VaultDialogRequest }) {
  const t = useT();
  const v = t.vault;
  const setVaultDialog = useUI((s) => s.setVaultDialog);
  const showToast = useUI((s) => s.showToast);
  const [view, setView] = useState<VaultView>(request.view);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The recovery code just made, until it is saved. */
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** The diary is encrypted on this device already: the cloud takes that vault. */
  const [ownVault] = useState(hasOwnVault);

  const close = () => {
    if (shownCode && !saved) return;
    setVaultDialog(null);
  };
  const go = (next: VaultView) => {
    setView(next);
    setError('');
  };

  const fail = (e: unknown) => {
    if (e instanceof WrongSecretError) {
      return setError(view === 'recover' ? v.errors.wrongCode : v.errors.wrongPassword);
    }
    if (e instanceof VaultChangedError) return setError(v.errors.changed);
    if (e instanceof PrivateHiddenError) return setError(v.errors.privateHidden);
    if (e instanceof VaultExistsError) {
      go('unlock');
      return setError(v.errors.exists);
    }
    setError(t.account.errors[accountError(e)] || t.account.errors.unknown);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const finish = (message: string) => {
    setVaultDialog(null);
    showToast(message);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const choosing = (view === 'create' && !ownVault) || view === 'recover' || view === 'change';
    const wrong = choosing && newPasswordError(password, repeat, t);
    if (wrong) return setError(wrong);
    if (view === 'create' && ownVault) {
      void run(async () => {
        await setUpVault(password);
        finish(v.ready);
      });
    } else if (view === 'create') {
      void run(async () => setShownCode(await setUpVault(password)));
    } else if (view === 'unlock') {
      void run(async () => {
        if (request.once) {
          const keys = await unlockOnce(password);
          setVaultDialog(null);
          await syncNow(keys);
          return;
        }
        finish((await unlock(password)) ? t.lock.adopted : v.unlocked);
      });
    } else if (view === 'recover') {
      void run(async () => {
        finish((await recover(code, password)) ? t.lock.adopted : v.unlocked);
      });
    } else if (view === 'change') {
      void run(async () => {
        await changeVaultPassword(current, password);
        finish(v.changed);
      });
    } else if (view === 'newCode') {
      void run(async () => setShownCode(await replaceRecoveryCode(password)));
    }
  };

  const titles: Record<VaultView, string> = {
    create: v.createTitle,
    unlock: v.unlockTitle,
    recover: v.recoverTitle,
    change: v.changeTitle,
    newCode: v.newCodeTitle,
  };
  const intros: Record<VaultView, string> = {
    create: v.createText,
    unlock: v.unlockText,
    recover: v.recoverText,
    change: '',
    newCode: v.newCodeText,
  };
  const submits: Record<VaultView, string> = {
    create: v.next,
    unlock: v.unlock,
    recover: v.recover,
    change: v.change,
    newCode: v.makeCode,
  };
  const icons: Record<VaultView, ReactNode> = {
    create: <LockKeyhole size={18} strokeWidth={1.75} aria-hidden />,
    unlock: <LockKeyholeOpen size={18} strokeWidth={1.75} aria-hidden />,
    recover: <KeyRound size={18} strokeWidth={1.75} aria-hidden />,
    change: <LockKeyhole size={18} strokeWidth={1.75} aria-hidden />,
    newCode: <KeyRound size={18} strokeWidth={1.75} aria-hidden />,
  };

  const field = phraseFields(() => setError(''));

  let body: ReactNode;
  if (shownCode) {
    body = (
      <RecoveryCode
        code={shownCode}
        saved={saved}
        onSaved={setSaved}
        finishLabel={view === 'create' ? v.activate : v.done}
        onFinish={() => {
          setVaultDialog(null);
          showToast(view === 'create' ? v.ready : v.done);
        }}
      />
    );
  } else {
    body = (
      <>
        {intros[view] && (
          <p className="account-text">
            {request.once
              ? v.onceText
              : ownVault && view === 'create'
                ? t.lock.ownVaultText
                : intros[view]}
          </p>
        )}
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
          {view === 'change' &&
            field(v.current, current, setCurrent, {
              autoFocus: true,
              autoComplete: 'current-password',
            })}
          {(view === 'unlock' || view === 'newCode' || (view === 'create' && ownVault)) &&
            field(v.password, password, setPassword, {
              autoFocus: true,
              autoComplete: 'current-password',
            })}
          {((view === 'create' && !ownVault) || view === 'recover' || view === 'change') && (
            <>
              {field(view === 'create' ? v.password : v.newPassword, password, setPassword, {
                autoFocus: view === 'create',
                hint: v.passwordHint,
              })}
              {field(v.repeat, repeat, setRepeat)}
            </>
          )}
          <FormError message={error} />
          <SubmitButton busy={busy}>{request.once ? v.onceSubmit : submits[view]}</SubmitButton>
        </form>
        <div className="account-links">
          {view === 'unlock' && !request.once && (
            <button type="button" className="account-link" onClick={() => go('recover')}>
              {v.forgot}
            </button>
          )}
          {view === 'recover' && request.view === 'unlock' && (
            <button type="button" className="account-link" onClick={() => go('unlock')}>
              {v.back}
            </button>
          )}
        </div>
      </>
    );
  }

  const locked = !!shownCode && !saved;
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog account-dialog vault-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <header className="dialog-header">
          <h2 id="vault-title" className="vault-title">
            {shownCode ? <KeyRound size={18} strokeWidth={1.75} aria-hidden /> : icons[view]}
            {shownCode ? v.codeTitle : titles[view]}
          </h2>
          {!locked && (
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
