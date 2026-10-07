import { KeyRound, Lock, LockKeyhole } from 'lucide-react';
import { readLock, useLock } from '../cloud/lockState';
import { useUI } from '../store/ui';
import { Choice } from './Choice';
import { lockDiaryNow } from './lockActions';
import { SettingsRow } from './SettingsRow';
import { useT } from './useT';

type Level = 'off' | 'all';

/** Settings → Privacy: whether the diary is encrypted on this device, and its password. */
export function PrivacySection() {
  const t = useT();
  const l = t.lock;
  const status = useLock((s) => s.status);
  const setLockDialog = useUI((s) => s.setLockDialog);
  const level: Level = status === 'off' ? 'off' : 'all';
  // With the account's vault, the password and the code change in "Account and cloud".
  const own = status !== 'off' && readLock()?.account === null;

  return (
    <section className="settings-section">
      <h3>{l.section}</h3>
      <SettingsRow label={l.level} hint={l.levelHints[level]}>
        <Choice
          options={(['off', 'all'] as const).map((id) => [id, l.levels[id]])}
          value={level}
          onChange={(next) => {
            if (next !== level) setLockDialog(next === 'all' ? 'enable' : 'disable');
          }}
        />
      </SettingsRow>
      {status !== 'off' && (
        <>
          <SettingsRow label={l.lockNow} hint={l.lockNowHint}>
            <button type="button" className="settings-btn" onClick={() => void lockDiaryNow()}>
              <Lock size={15} strokeWidth={1.75} /> {l.lockNow}
            </button>
          </SettingsRow>
          {own ? (
            <>
              <SettingsRow label={t.vault.passwordRow}>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => setLockDialog('change')}
                >
                  <LockKeyhole size={15} strokeWidth={1.75} /> {t.vault.change}
                </button>
              </SettingsRow>
              <SettingsRow label={t.vault.codeRow}>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => setLockDialog('newCode')}
                >
                  <KeyRound size={15} strokeWidth={1.75} /> {t.vault.newCode}
                </button>
              </SettingsRow>
            </>
          ) : (
            <p className="settings-note">{l.cloudPassword}</p>
          )}
        </>
      )}
    </section>
  );
}
