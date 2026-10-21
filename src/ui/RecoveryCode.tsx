import { Copy, Download, Printer } from 'lucide-react';
import { useAccount } from '../cloud/account';
import { locale } from '../i18n';
import { useUI } from '../store/ui';
import { saveFile } from './fileActions';
import { useT } from './useT';

/**
 * The recovery code, shown once: to download, print or copy, and say it was saved. The
 * cloud's one by default; the diary encrypted on the device without an account says
 * its own text.
 */
export function RecoveryCode({
  code,
  saved,
  onSaved,
  finishLabel,
  onFinish,
  local = false,
}: {
  code: string;
  saved: boolean;
  onSaved: (saved: boolean) => void;
  finishLabel: string;
  onFinish: () => void;
  local?: boolean;
}) {
  const t = useT();
  const v = t.vault;
  const showToast = useUI((s) => s.showToast);
  const email = useAccount((s) => s.account?.email ?? '');
  const file = () => {
    const date = new Date().toLocaleDateString(locale(), { dateStyle: 'long' });
    return local ? t.lock.file(code, date) : v.file(email, code, date);
  };
  const groups = code.split('-');

  return (
    <>
      <p className="account-text">{local ? t.lock.codeText : v.codeText}</p>
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
