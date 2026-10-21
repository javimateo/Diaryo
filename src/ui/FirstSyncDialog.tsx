import { Combine, FilePlus2, Replace, Upload, X } from 'lucide-react';
import { chooseFirstSync, useSync } from './cloudSync';
import { useT } from './useT';

/**
 * The first sync with a diary on this device: with another one in the cloud, merge them or
 * use the cloud's (keeping this one in a file); with none there, upload this one or start a
 * blank one (keeping this one too). Or signing in again with changes here that aren't in
 * the cloud: upload them, or use the cloud's diary.
 */
export function FirstSyncDialog() {
  const t = useT();
  const s = t.sync;
  const choosing = useSync((state) => state.choosing);
  const pending = useSync((state) => state.pending);
  if (!choosing) return null;
  const back = choosing === 'return';
  const empty = choosing === 'empty';
  const choose = (choice: 'merge' | 'cloud' | 'later') => () => void chooseFirstSync(choice);

  return (
    <div className="dialog-backdrop" onClick={choose('later')}>
      <div
        className="dialog open-copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-sync-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') void chooseFirstSync('later');
        }}
      >
        <header className="dialog-header">
          <h2 id="first-sync-title">
            {back ? s.returnTitle : empty ? s.emptyTitle : s.firstTitle}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.common.close}
            onClick={choose('later')}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <p className="open-copy-text">
          {back ? s.returnText(pending) : empty ? s.emptyText : s.firstText}
        </p>
        <button
          type="button"
          className="open-copy-option"
          data-primary
          autoFocus
          onClick={choose('merge')}
        >
          {empty ? (
            <Upload size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <Combine size={20} strokeWidth={1.75} aria-hidden />
          )}
          <span>
            <strong>{back ? s.keepMine : empty ? s.upload : s.merge}</strong>
            <small>{back ? s.keepMineHint : empty ? s.uploadHint : s.mergeHint}</small>
          </span>
        </button>
        <button type="button" className="open-copy-option" onClick={choose('cloud')}>
          {empty ? (
            <FilePlus2 size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <Replace size={20} strokeWidth={1.75} aria-hidden />
          )}
          <span>
            <strong>{empty ? s.startNew : s.useCloud}</strong>
            <small>{back ? s.useCloudReturnHint : empty ? s.startNewHint : s.useCloudHint}</small>
          </span>
        </button>
        <div className="open-copy-footer">
          <button type="button" className="settings-btn" onClick={choose('later')}>
            {s.later}
          </button>
        </div>
      </div>
    </div>
  );
}
