import { X } from 'lucide-react';
import { useUI } from '../store/ui';
import { TOOLS } from './toolDefs';
import { howToLists, shortcutLists, type HowTo, type Shortcut } from './helpContent';
import { useT } from './useT';

export function HelpDialog() {
  const t = useT();
  const open = useUI((s) => s.helpOpen);
  const setOpen = useUI((s) => s.setHelpOpen);
  const desktop = useUI((s) => s.desktop);
  const tab = useUI((s) => s.helpTab);
  if (!open) return null;
  const lists = shortcutLists(t, desktop);
  const howTo = howToLists(t, desktop);

  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="help-title">{t.help.title}</h2>
          <div className="segmented-group help-tabs" role="tablist">
            {(['howTo', 'shortcuts'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="icon-btn text-option"
                data-active={tab === id || undefined}
                aria-selected={tab === id}
                onClick={() => setOpen(true, id)}
              >
                {t.help.tabs[id]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.common.close}
            onClick={() => setOpen(false)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        {tab === 'howTo' ? (
          <div className="dialog-body" data-scrollable>
            <section>
              <h3>{t.help.tools}</h3>
              <HowToList items={howTo.tools} />
            </section>
            <section>
              <h3>{t.help.gesturesTitle}</h3>
              <HowToList items={howTo.gestures} />
            </section>
          </div>
        ) : (
          <div className="dialog-body" data-scrollable>
            <section>
              <h3>{t.help.tools}</h3>
              <ul className="shortcut-list">
                {TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <span>{t.tools.names[tool.id]}</span>
                    <Combos
                      combos={
                        tool.digit
                          ? [[tool.key.toUpperCase()], [tool.digit]]
                          : [[tool.key.toUpperCase()]]
                      }
                    />
                  </li>
                ))}
              </ul>
              <h3>{t.help.writing}</h3>
              <ShortcutList items={lists.writing} />
              <h3>{t.help.navigation}</h3>
              <ShortcutList items={lists.navigation} />
              <h3>{t.help.diary}</h3>
              <ShortcutList items={lists.diary} />
            </section>
            <section>
              <h3>{t.help.selection}</h3>
              <ShortcutList items={lists.selection} />
              <h3>{t.help.general}</h3>
              <ShortcutList items={lists.general} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/** Each tool or gesture: its icon, its name with its keys, and what it is for. */
function HowToList({ items }: { items: HowTo[] }) {
  return (
    <ul className="howto-list">
      {items.map(({ id, icon: Icon, title, text, keys }) => (
        <li key={id}>
          <span className="howto-icon" aria-hidden>
            <Icon size={17} strokeWidth={1.75} />
          </span>
          <span className="howto-title">
            {title}
            {keys.length > 0 && <Combos combos={keys} />}
          </span>
          <span className="howto-text">{text}</span>
        </li>
      ))}
    </ul>
  );
}

function ShortcutList({ items }: { items: Shortcut[] }) {
  return (
    <ul className="shortcut-list">
      {items.map(([label, combos]) => (
        <li key={label}>
          <span>{label}</span>
          <Combos combos={combos} />
        </li>
      ))}
    </ul>
  );
}

function Combos({ combos }: { combos: string[][] }) {
  const t = useT();
  return (
    <span className="combos">
      {combos.map((combo, i) => (
        <span key={i} className="combo">
          {i > 0 && <span className="combo-or">{t.help.or}</span>}
          {combo.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
