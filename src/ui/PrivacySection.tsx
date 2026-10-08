import { Eye, EyeOff, KeyRound, Lock, LockKeyhole } from 'lucide-react';
import { hideNotes } from '../cloud/lock';
import { readLock, useLock, type LockLevel } from '../cloud/lockState';
import { useUI, type HidePrivate, type LockView } from '../store/ui';
import { Choice } from './Choice';
import { lockDiaryNow } from './lockActions';
import { SettingsRow } from './SettingsRow';
import { useT } from './useT';

type Level = LockLevel | 'off';

/** From one level to another: what the dialog does. */
const CHANGES: Record<Level, Partial<Record<Level, LockView>>> = {
  off: { private: 'private', all: 'all' },
  private: { all: 'all', off: 'off' },
  all: { private: 'down', off: 'off' },
};

const HIDE_AFTER: HidePrivate[] = ['minimize', 15, 60];

/**
 * Settings → Privacy: what is encrypted on this device (nothing, only the private notes,
 * or the whole diary), showing the private notes, and the diary password.
 */
export function PrivacySection() {
  const t = useT();
  const l = t.lock;
  const level = useLock((s) => s.level);
  const revealed = useLock((s) => s.revealed);
  const setLockDialog = useUI((s) => s.setLockDialog);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  // With the account's vault, the password and the code change in "Account and cloud".
  const own = level !== 'off' && readLock()?.account === null;

  return (
    <section className="settings-section">
      <h3>{l.section}</h3>
      <SettingsRow label={l.level} hint={l.levelHints[level]}>
        <Choice
          options={(['off', 'private', 'all'] as const).map((id) => [id, l.levels[id]])}
          value={level}
          onChange={(next) => {
            const view = CHANGES[level][next];
            if (view) setLockDialog({ view, fromSettings: true });
          }}
        />
      </SettingsRow>
      {level !== 'off' && (
        <>
          <SettingsRow label={l.privateRow}>
            {revealed ? (
              <button type="button" className="settings-btn" onClick={() => void hideNotes('all')}>
                <EyeOff size={15} strokeWidth={1.75} /> {l.hide}
              </button>
            ) : (
              <button
                type="button"
                className="settings-btn"
                onClick={() => setLockDialog({ view: 'reveal', notes: 'all', fromSettings: true })}
              >
                <Eye size={15} strokeWidth={1.75} /> {l.show}
              </button>
            )}
          </SettingsRow>
          <SettingsRow label={l.hidePrivate}>
            <Choice
              options={HIDE_AFTER.map((id) => [id, l.hidePrivateOptions[id]])}
              value={settings.hidePrivate}
              onChange={(hidePrivate) => setSettings({ hidePrivate })}
            />
          </SettingsRow>
        </>
      )}
      {level === 'all' && (
        <SettingsRow label={l.lockNow} hint={l.lockNowHint}>
          <button type="button" className="settings-btn" onClick={() => void lockDiaryNow()}>
            <Lock size={15} strokeWidth={1.75} /> {l.lockNow}
          </button>
        </SettingsRow>
      )}
      {level !== 'off' &&
        (own ? (
          <>
            <SettingsRow label={t.vault.passwordRow}>
              <button
                type="button"
                className="settings-btn"
                onClick={() => setLockDialog({ view: 'change', fromSettings: true })}
              >
                <LockKeyhole size={15} strokeWidth={1.75} /> {t.vault.change}
              </button>
            </SettingsRow>
            <SettingsRow label={t.vault.codeRow}>
              <button
                type="button"
                className="settings-btn"
                onClick={() => setLockDialog({ view: 'newCode', fromSettings: true })}
              >
                <KeyRound size={15} strokeWidth={1.75} /> {t.vault.newCode}
              </button>
            </SettingsRow>
          </>
        ) : (
          <p className="settings-note">{l.cloudPassword}</p>
        ))}
    </section>
  );
}
