import { Combine, Replace, X } from 'lucide-react';
import { useUI } from '../store/ui';
import { mergeWithCopy, replaceWithCopy } from './fileActions';
import { useT } from './useT';

/**
 * Opening a whole-diary backup: replace the diary with it (what "opening" usually means;
 * the current one is kept first) or merge both (to recover something from an old copy).
 */
export function OpenCopyDialog() {
  const t = useT();
  const copy = useUI((s) => s.pendingCopy);
  const diary = useUI((s) => s.diary);
  const setPendingCopy = useUI((s) => s.setPendingCopy);
  if (!copy || !diary) return null;

  const close = () => setPendingCopy(null);
  const run = (action: () => Promise<void>) => () => {
    close();
    void action();
  };

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog open-copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-copy-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <header className="dialog-header">
          <h2 id="open-copy-title">{t.openCopy.title}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <p className="open-copy-text">{t.openCopy.text}</p>
        <button
          type="button"
          className="open-copy-option"
          data-primary
          autoFocus
          onClick={run(() => replaceWithCopy(diary, copy))}
        >
          <Replace size={20} strokeWidth={1.75} aria-hidden />
          <span>
            <strong>{t.openCopy.replace}</strong>
            <small>{t.openCopy.replaceHint}</small>
          </span>
        </button>
        <button
          type="button"
          className="open-copy-option"
          onClick={run(() => mergeWithCopy(diary, copy))}
        >
          <Combine size={20} strokeWidth={1.75} aria-hidden />
          <span>
            <strong>{t.openCopy.merge}</strong>
            <small>{t.openCopy.mergeHint}</small>
          </span>
        </button>
        <p className="open-copy-note">{t.openCopy.fileUntouched}</p>
        <div className="open-copy-footer">
          <button type="button" className="settings-btn" onClick={close}>
            {t.openCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
