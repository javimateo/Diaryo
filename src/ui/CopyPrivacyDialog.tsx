import { FileLock2, FileText, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { WrongSecretError } from '../cloud/crypto';
import { openSealedCopy } from '../cloud/lock';
import { useUI, type CopyPrivacy } from '../store/ui';
import { openCopyText, saveCopy } from './fileActions';
import { FormError, phraseFields, RecoveryCodeField, SubmitButton } from './passwordForm';
import { useT } from './useT';

/**
 * With the diary encrypted on this device: a copy is saved encrypted (the default) or
 * readable, and an encrypted copy of another diary asks for its password or code.
 */
export function CopyPrivacyDialog() {
  const copy = useUI((s) => s.copyPrivacy);
  if (!copy) return null;
  return <Dialog copy={copy} />;
}

function Dialog({ copy }: { copy: CopyPrivacy }) {
  const t = useT();
  const l = t.lock;
  const setCopyPrivacy = useUI((s) => s.setCopyPrivacy);
  const close = () => setCopyPrivacy(null);

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className={`dialog ${copy.kind === 'save' ? 'open-copy-dialog' : 'account-dialog vault-dialog'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-privacy-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <header className="dialog-header">
          <h2 id="copy-privacy-title">{copy.kind === 'save' ? l.saveTitle : l.openTitle}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        {copy.kind === 'save' ? <SaveChoice close={close} /> : <OpenSealed copy={copy} />}
      </div>
    </div>
  );
}

function SaveChoice({ close }: { close: () => void }) {
  const t = useT();
  const l = t.lock;
  const diary = useUI((s) => s.diary);
  const save = (readable: boolean) => () => {
    close();
    if (diary) void saveCopy(diary, readable);
  };
  return (
    <>
      <p className="open-copy-text">{l.saveText}</p>
      <button
        type="button"
        className="open-copy-option"
        data-primary
        autoFocus
        onClick={save(false)}
      >
        <FileLock2 size={20} strokeWidth={1.75} aria-hidden />
        <span>
          <strong>{l.sealed}</strong>
          <small>{l.sealedHint}</small>
        </span>
      </button>
      <button type="button" className="open-copy-option" onClick={save(true)}>
        <FileText size={20} strokeWidth={1.75} aria-hidden />
        <span>
          <strong>{l.readable}</strong>
          <small>{l.readableHint}</small>
        </span>
      </button>
      <div className="open-copy-footer">
        <button type="button" className="settings-btn" onClick={close}>
          {t.openCopy.cancel}
        </button>
      </div>
    </>
  );
}

function OpenSealed({ copy }: { copy: Extract<CopyPrivacy, { kind: 'open' }> }) {
  const t = useT();
  const l = t.lock;
  const v = t.vault;
  const setCopyPrivacy = useUI((s) => s.setCopyPrivacy);
  const [withCode, setWithCode] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = phraseFields(() => setError(''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const text = await openSealedCopy(
          copy.backup,
          withCode ? { code: value } : { password: value },
        );
        setCopyPrivacy(null);
        const { engine } = useUI.getState();
        if (engine) await openCopyText(engine, text);
      } catch (e) {
        if (!(e instanceof WrongSecretError)) console.error("Couldn't open the copy", e);
        setError(withCode ? v.errors.wrongCode : v.errors.wrongPassword);
        setBusy(false);
      }
    })();
  };

  return (
    <div className="account-body">
      <p className="account-text">{l.openText}</p>
      <form className="account-form" onSubmit={submit}>
        {withCode ? (
          <RecoveryCodeField
            value={value}
            onChange={(next) => {
              setValue(next);
              setError('');
            }}
          />
        ) : (
          field(v.password, value, setValue, { autoFocus: true, autoComplete: 'current-password' })
        )}
        <FormError message={error} />
        <SubmitButton busy={busy}>{l.open}</SubmitButton>
      </form>
      <div className="account-links">
        <button
          type="button"
          className="account-link"
          onClick={() => {
            setWithCode(!withCode);
            setValue('');
            setError('');
          }}
        >
          {withCode ? l.usePassword : l.useCode}
        </button>
      </div>
    </div>
  );
}
