import { en } from '@app/i18n/en';
import { es } from '@app/i18n/es';
import { TOOLS } from '@app/ui/toolDefs';
import { howToLists, shortcutLists, type HowTo, type Shortcut } from '@app/ui/helpContent';
import type { Lang } from '../i18n';

/** The Windows app's shortcuts as they come (each person can change them in Settings). */
const DESKTOP = { shortcut: 'Ctrl+Alt+D', deskShortcut: 'Ctrl+Alt+N' };

/**
 * The help of the app, as a page: the same lists and the same texts as its Help window
 * (`helpContent`), so both always say the same. Drawn once, when the site is built.
 */
export function HelpLists({ lang, shortcutsTitle }: { lang: Lang; shortcutsTitle: string }) {
  const t = lang === 'es' ? es : en;
  const howTo = howToLists(t, DESKTOP);
  const lists = shortcutLists(t, DESKTOP);
  const tools: Shortcut[] = TOOLS.map((tool) => [
    t.tools.names[tool.id],
    tool.digit ? [[tool.key.toUpperCase()], [tool.digit]] : [[tool.key.toUpperCase()]],
  ]);
  const groups: [string, Shortcut[]][] = [
    [t.help.tools, tools],
    [t.help.writing, lists.writing],
    [t.help.navigation, lists.navigation],
    [t.help.diary, lists.diary],
    [t.help.selection, lists.selection],
    [t.help.general, lists.general],
  ];
  const parts: [string, string][] = [
    ['tools', t.help.tools],
    ['gestures', t.help.gesturesTitle],
    ['shortcuts', shortcutsTitle],
  ];
  return (
    <>
      <nav className="help-toc">
        {parts.map(([id, title]) => (
          <a key={id} href={`#${id}`}>
            {title}
          </a>
        ))}
      </nav>
      <section id="tools" className="help-card">
        <h2>{t.help.tools}</h2>
        <HowToList items={howTo.tools} or={t.help.or} />
      </section>
      <section id="gestures" className="help-card">
        <h2>{t.help.gesturesTitle}</h2>
        <HowToList items={howTo.gestures} or={t.help.or} />
      </section>
      <section id="shortcuts" className="help-card">
        <h2>{shortcutsTitle}</h2>
        <div className="help-columns">
          {groups.map(([title, items]) => (
            <div key={title}>
              <h3>{title}</h3>
              <ul className="help-shortcuts">
                {items.map(([label, combos]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <Combos combos={combos} or={t.help.or} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function HowToList({ items, or }: { items: HowTo[]; or: string }) {
  return (
    <ul className="help-howto">
      {items.map(({ id, icon: Icon, title, text, keys }) => (
        <li key={id}>
          <span className="help-icon" aria-hidden>
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <span className="help-title">
            {title}
            {keys.length > 0 && <Combos combos={keys} or={or} />}
          </span>
          <span className="help-text">{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Combos({ combos, or }: { combos: string[][]; or: string }) {
  return (
    <span className="help-combos">
      {combos.map((combo, i) => (
        <span key={i}>
          {i > 0 && <span className="help-or">{or}</span>}
          {combo.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
