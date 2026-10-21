import { Cloud, Eye, EyeOff, KeyRound, Lock, LockKeyhole } from 'lucide-react';
import { hideNotes } from '../cloud/lock';
import { readLock, useLock, type LockLevel } from '../cloud/lockState';
import { isDesktop } from '../desktop/tauri';
import { useUI, type AutoLock, type HidePrivate, type LockView } from '../store/ui';
import { Choice } from './Choice';
import { lockDiaryNow } from './lockActions';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { useT } from './useT';

type Level = LockLevel | 'off';

/** From one level to another: what the dialog does. */
const CHANGES: Record<Level, Partial<Record<Level, LockView>>> = {
  off: { private: 'private', all: 'all' },
  private: { all: 'all', off: 'off' },
  all: { private: 'down', off: 'off' },
};

const HIDE_AFTER: HidePrivate[] = [30, 60, 300];
const AUTO_LOCK: AutoLock[] = [0, 5, 15, 60];

/**
 * Settings → Privacy: what is encrypted on this device (nothing, only the private notes,
 * or the whole diary), the diary password, locking, and showing the private notes.
 */
export function PrivacySection() {
  const t = useT();
  const l = t.lock;
  const level = useLock((s) => s.level);
  const revealed = useLock((s) => s.revealed);
  const setLockDialog = useUI((s) => s.setLockDialog);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const setSection = useUI((s) => s.setSettingsSection);
  // With the account's vault, the password and the code change in "Account and cloud".
  const own = level !== 'off' && readLock()?.account === null;

  const passwordRows = own ? (
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
    <SettingsRow label={t.vault.passwordRow} hint={l.cloudPassword}>
      <button type="button" className="settings-btn" onClick={() => setSection('account')}>
        <Cloud size={15} strokeWidth={1.75} /> {t.settings.sections.account}
      </button>
    </SettingsRow>
  );

  return (
    <>
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
      {level !== 'off' && passwordRows}
      {level === 'all' && (
        <section className="settings-group">
          <h4>{l.lockGroup}</h4>
          <SettingsRow label={l.autoLock} hint={l.autoLockHint}>
            <Choice
              options={AUTO_LOCK.map((id) => [id, l.autoLockOptions[id]])}
              value={settings.autoLock}
              onChange={(autoLock) => setSettings({ autoLock })}
            />
          </SettingsRow>
          <SettingsRow label={l.lockAway} hint={l.lockAwayHint(isDesktop())}>
            <Switch
              checked={settings.lockAway}
              label={l.lockAway}
              onChange={(lockAway) => setSettings({ lockAway })}
            />
          </SettingsRow>
          <SettingsRow label={l.lockNow} hint={l.lockNowHint}>
            <button type="button" className="settings-btn" onClick={() => void lockDiaryNow()}>
              <Lock size={15} strokeWidth={1.75} /> {l.lockNow}
            </button>
          </SettingsRow>
        </section>
      )}
      {level !== 'off' && (
        <section className="settings-group">
          <h4>{l.privateRow}</h4>
          <SettingsRow label={l.privateAll}>
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
          <SettingsRow label={l.hidePrivate} hint={l.hidePrivateHint}>
            <Choice
              options={HIDE_AFTER.map((id) => [id, l.hidePrivateOptions[id]])}
              value={settings.hidePrivate}
              onChange={(hidePrivate) => setSettings({ hidePrivate })}
            />
          </SettingsRow>
          <SettingsRow label={l.hidePrivateAway} hint={l.hidePrivateAwayHint}>
            <Switch
              checked={settings.hidePrivateAway}
              label={l.hidePrivateAway}
              onChange={(hidePrivateAway) => setSettings({ hidePrivateAway })}
            />
          </SettingsRow>
        </section>
      )}
    </>
  );
}
