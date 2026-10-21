import { Cloud, FolderOpen, MonitorSmartphone } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useAccount } from '../cloud/account';
import { onlyWelcome, welcomeDump } from '../diary/welcome';
import { coverTemplate } from '../engine/coverTemplates';
import { LANGUAGES, t as texts, type Language } from '../i18n';
import { todayKey } from '../lib/dates';
import { getDB } from '../storage/db';
import { useUI } from '../store/ui';
import { Choice } from './Choice';
import { useSync } from './cloudSync';
import { pickCopy } from './fileActions';
import { useT } from './useT';

/** Width of the cover's picture (twice what it shows, for sharp screens). */
const COVER_WIDTH = 360;

/**
 * The first time the app opens, over the welcome page: the diary's cover, closed, and
 * beside it: open it (with the tour), sign in to the account (where one can also be
 * created) to bring the diary from the cloud, open a copy, or change the language. While the account's or the copy's windows are up it steps aside, and comes
 * back if they close with nothing done. Signing in closes it: the tour is offered once
 * those windows are gone (opening a copy offers it with its own notice).
 */
export function WelcomeDialog() {
  const t = useT();
  const open = useUI((s) => s.welcomeOpen);
  const setWelcomeOpen = useUI((s) => s.setWelcomeOpen);
  const setTour = useUI((s) => s.setTour);
  const setAccountDialog = useUI((s) => s.setAccountDialog);
  const language = useUI((s) => s.settings.language);
  const diary = useUI((s) => s.diary);
  const style = useUI((s) => s.bookStyle);
  const account = useAccount((s) => s.account);
  const dialogs = useUI(
    (s) => !!(s.accountDialog || s.vaultDialog || s.copyPrivacy || s.pendingCopy),
  );
  const choosing = useSync((s) => !!s.choosing);
  /** Another window is up: this one waits. */
  const busy = dialogs || choosing;
  // The user's covers with the name in chalk (one of the cover's own templates).
  const cover = useMemo(() => {
    const words = { ...t.cover.templateTexts, chalk: 'diaryo' };
    return diary?.coverPreview(
      coverTemplate('chalk', words, new Date().getFullYear()),
      COVER_WIDTH,
    );
    // The covers' look changes the picture too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary, t, style]);
  /** Signed in from here: the tour is offered once nothing else is on screen. */
  const offered = useRef(false);

  useEffect(() => {
    if (open && account) {
      setWelcomeOpen(false);
      offered.current = true;
    }
    if (!offered.current || busy) return;
    offered.current = false;
    useUI.getState().showToast(texts().welcome.dialog.tourOffer, {
      label: texts().welcome.dialog.showTour,
      run: () => setTour(0),
    });
  }, [open, account, busy, setWelcomeOpen, setTour]);

  if (!open || busy) return null;
  const d = t.welcome.dialog;

  const start = () => {
    setWelcomeOpen(false);
    setTour(0);
  };

  // The welcome page is written again in the new language (it is still only the sample).
  const changeLanguage = async (next: Language) => {
    useUI.getState().setSettings({ language: next });
    if (diary && (await onlyWelcome(getDB()))) {
      await diary.replace(welcomeDump(texts().welcome.page, todayKey(), next), false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') start();
        }}
      >
        <div className="welcome-cover">{cover && <img src={cover} alt="" draggable={false} />}</div>
        <div className="welcome-body">
          <div className="welcome-language">
            <Choice
              options={Object.entries(LANGUAGES) as [Language, string][]}
              value={language}
              onChange={(next) => void changeLanguage(next)}
            />
          </div>
          <h2 id="welcome-title">{d.title}</h2>
          <p className="welcome-text">{d.text}</p>
          <button type="button" className="account-primary welcome-start" autoFocus onClick={start}>
            {d.start}
          </button>
          <div className="welcome-links">
            <button
              type="button"
              className="account-link"
              onClick={() => setAccountDialog({ view: 'signIn' })}
            >
              <Cloud size={15} strokeWidth={1.75} aria-hidden />
              {d.account}
            </button>
            <button type="button" className="account-link" onClick={pickCopy}>
              <FolderOpen size={15} strokeWidth={1.75} aria-hidden />
              {d.openCopy}
            </button>
          </div>
          <p className="welcome-local">
            <MonitorSmartphone size={14} strokeWidth={1.75} aria-hidden />
            {d.local}
          </p>
        </div>
      </div>
    </div>
  );
}
