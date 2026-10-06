import {
  Copy,
  Download,
  KeyRound,
  Loader2,
  LockKeyhole,
  LockKeyholeOpen,
  Printer,
  X,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { accountError, PASSWORD_MIN, useAccount } from '../cloud/account';
import { WrongSecretError } from '../cloud/crypto';
import {
  changeVaultPassword,
  recover,
  replaceRecoveryCode,
  setUpVault,
  unlock,
  unlockOnce,
  VaultExistsError,
} from '../cloud/vault';
import { locale } from '../i18n';
import { useUI, type VaultDialogRequest, type VaultView } from '../store/ui';
import { syncNow } from './cloudSync';
import { saveFile } from './fileActions';
import { PasswordField } from './PasswordField';
import { useT } from './useT';

/** The diary password allows long phrases. */
const PHRASE_MAX = 200;

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
    const choosing = view === 'create' || view === 'recover' || view === 'change';
    if (choosing && password.length < PASSWORD_MIN) {
      return setError(t.account.errors.shortPassword(PASSWORD_MIN));
    }
    if (choosing && password !== repeat) return setError(v.errors.mismatch);
    if (view === 'create') {
      void run(async () => setShownCode(await setUpVault(password)));
    } else if (view === 'unlock') {
      void run(async () => {
        if (request.once) {
          const keys = await unlockOnce(password);
          setVaultDialog(null);
          await syncNow(keys);
          return;
        }
        await unlock(password);
        finish(v.unlocked);
      });
    } else if (view === 'recover') {
      void run(async () => {
        await recover(code, password);
        finish(v.unlocked);
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
        {intros[view] && <p className="account-text">{request.once ? v.onceText : intros[view]}</p>}
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
          {(view === 'unlock' || view === 'newCode') &&
            field(v.password, password, setPassword, {
              autoFocus: true,
              autoComplete: 'current-password',
            })}
          {(view === 'create' || view === 'recover' || view === 'change') && (
            <>
              {field(view === 'create' ? v.password : v.newPassword, password, setPassword, {
                autoFocus: view === 'create',
                hint: v.passwordHint,
              })}
              {field(v.repeat, repeat, setRepeat)}
            </>
          )}
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="account-primary" disabled={busy}>
            {busy && <Loader2 size={15} strokeWidth={2} className="account-spin" aria-hidden />}
            {request.once ? v.onceSubmit : submits[view]}
          </button>
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

/** The recovery code, shown once: to download, print or copy, and say it was saved. */
function RecoveryCode({
  code,
  saved,
  onSaved,
  finishLabel,
  onFinish,
}: {
  code: string;
  saved: boolean;
  onSaved: (saved: boolean) => void;
  finishLabel: string;
  onFinish: () => void;
}) {
  const t = useT();
  const v = t.vault;
  const showToast = useUI((s) => s.showToast);
  const email = useAccount((s) => s.account?.email ?? '');
  const file = () =>
    v.file(email, code, new Date().toLocaleDateString(locale(), { dateStyle: 'long' }));
  const groups = code.split('-');

  return (
    <>
      <p className="account-text">{v.codeText}</p>
      <div className="vault-code" aria-label={v.code}>
        {[0, 4, 8].map((start) => (
          <span key={start}>{groups.slice(start, start + 4).join('-')}</span>
        ))}
      </div>
      <div className="vault-code-actions">
        <button
          type="button"
          className="settings-btn"
          onClick={() =>
            void saveFile(new Blob([file()], { type: 'text/plain' }), `${v.fileName}.txt`)
          }
        >
          <Download size={15} strokeWidth={1.75} /> {v.download}
        </button>
        <button type="button" className="settings-btn" onClick={() => printText(file())}>
          <Printer size={15} strokeWidth={1.75} /> {v.print}
        </button>
        <button
          type="button"
          className="settings-btn"
          onClick={() =>
            void navigator.clipboard.writeText(code).then(
              () => showToast(v.copied),
              () => undefined,
            )
          }
        >
          <Copy size={15} strokeWidth={1.75} /> {v.copy}
        </button>
      </div>
      <label className="vault-saved">
        <input type="checkbox" checked={saved} onChange={(e) => onSaved(e.target.checked)} />
        {v.saved}
      </label>
      <button type="button" className="account-primary" disabled={!saved} onClick={onFinish}>
        {finishLabel}
      </button>
    </>
  );
}

/** Prints a text alone (in a frame of its own, so the diary isn't printed). */
function printText(text: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  const pre = doc.createElement('pre');
  pre.style.cssText = 'font:15px/1.7 ui-monospace,monospace;white-space:pre-wrap;margin:32px';
  pre.textContent = text;
  doc.body.append(pre);
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
}
