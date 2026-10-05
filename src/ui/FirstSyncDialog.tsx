import { Combine, Replace, X } from 'lucide-react';
import { chooseFirstSync, useSync } from './cloudSync';
import { useT } from './useT';

/**
 * The first sync, with a diary on this device and another one in the cloud, or signing in
 * again with changes here that aren't in the cloud: merge them, or use the cloud's diary
 * and keep this one in a file.
 */
export function FirstSyncDialog() {
  const t = useT();
  const s = t.sync;
  const choosing = useSync((state) => state.choosing);
  const pending = useSync((state) => state.pending);
  if (!choosing) return null;
  const back = choosing === 'return';
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
          <h2 id="first-sync-title">{back ? s.returnTitle : s.firstTitle}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.common.close}
            onClick={choose('later')}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <p className="open-copy-text">{back ? s.returnText(pending) : s.firstText}</p>
        <button
          type="button"
          className="open-copy-option"
          data-primary
          autoFocus
          onClick={choose('merge')}
        >
          <Combine size={20} strokeWidth={1.75} aria-hidden />
          <span>
            <strong>{back ? s.keepMine : s.merge}</strong>
            <small>{back ? s.keepMineHint : s.mergeHint}</small>
          </span>
        </button>
        <button type="button" className="open-copy-option" onClick={choose('cloud')}>
          <Replace size={20} strokeWidth={1.75} aria-hidden />
          <span>
            <strong>{s.useCloud}</strong>
            <small>{back ? s.useCloudReturnHint : s.useCloudHint}</small>
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
