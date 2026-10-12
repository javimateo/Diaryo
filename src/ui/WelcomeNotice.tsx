import { WELCOME_PAGE, WELCOME_PREFIX } from '../diary/welcome';
import { useUI } from '../store/ui';
import { useT } from './useT';

const isWelcome = (id: string) => id.startsWith(WELCOME_PREFIX);

/**
 * Under the welcome page, while it only has its examples: it is a sample, and it can be
 * cleared at once (with its note on the desk; it can be undone). Once something of your
 * own is on it, it is a page like any other and the notice goes.
 */
export function WelcomeNotice() {
  const t = useT();
  const engine = useUI((s) => s.engine);
  const current = useUI((s) => s.diaryState.current);
  // Changes of the page make it check again.
  useUI((s) => s.doc);
  if (!engine || current?.id !== WELCOME_PAGE) return null;
  const page = engine.pageElements();
  if (page.length === 0 || !page.every((el) => isWelcome(el.id))) return null;

  const clear = () => {
    const ids = engine
      .allElements()
      .filter((el) => isWelcome(el.id))
      .map((el) => el.id);
    if (!engine.deleteElements(ids)) return;
    useUI.getState().showToast(t.welcome.cleared, {
      label: t.commands.undo,
      run: () => engine.undo(),
    });
  };

  return (
    <div className="welcome-notice floating">
      <span>{t.welcome.notice}</span>
      <button type="button" className="welcome-clear" onClick={clear}>
        {t.welcome.clear}
      </button>
    </div>
  );
}
