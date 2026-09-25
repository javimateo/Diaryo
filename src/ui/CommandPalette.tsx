import {
  CalendarPlus,
  Check,
  CornerDownLeft,
  PenLine,
  Search,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatDay, formatDayMonth, relativeDay, todayKey, type DayKey } from '../diary/dates';
import { comparePages, pagesOfDay, type PageMeta } from '../diary/pages';
import {
  findInText,
  matchesPrefixes,
  parseDayQuery,
  queryWords,
  type Snippet,
} from '../diary/search';
import type { SceneElement } from '../engine/elements';
import { DESK_ID, type TextEntry } from '../storage/db';
import { useUI } from '../store/ui';
import { getCommands, type Command, type CommandPrompt } from './commands';
import { pageName } from './LinkDialog';

type Result =
  | { kind: 'command'; key: string; command: Command; showGroup?: boolean }
  | { kind: 'day'; key: string; date: DayKey }
  | { kind: 'page'; key: string; page: PageMeta }
  | { kind: 'text'; key: string; entry: TextEntry; snippet: Snippet; place: string };

interface Section {
  title: string;
  results: Result[];
}

const RECENT_PAGES = 4;
const MAX_PAGES = 8;
const MAX_TEXTS = 50;

const TEXT_ICONS: Partial<Record<SceneElement['type'], LucideIcon>> = {
  text: Type,
  note: StickyNote,
  shape: Square,
  stroke: PenLine,
};

/**
 * Paleta de comandos y búsqueda (Ctrl+K): encuentra páginas, días ("ayer", "24 sept"),
 * lo escrito en cualquier página o en la mesa, y todo lo que se puede hacer.
 */
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const setOpen = useUI((s) => s.setPaletteOpen);
  const diary = useUI((s) => s.diary);
  const { pages, current } = useUI((s) => s.diaryState);
  const [commands] = useState(getCommands);
  const [texts, setTexts] = useState<TextEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [prompt, setPrompt] = useState<CommandPrompt | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lo escrito en todo el diario se lee una vez al abrir; luego se busca en memoria.
  useEffect(() => {
    let alive = true;
    void diary?.texts().then((entries) => alive && setTexts(entries));
    return () => {
      alive = false;
    };
  }, [diary]);

  const sections = useMemo(
    () => (prompt ? [] : buildSections(query, commands, pages, current, texts)),
    [prompt, query, commands, pages, current, texts],
  );
  const results = sections.flatMap((s) => s.results);
  const searching = !prompt && texts === null && queryWords(query).length > 0;

  // Al pedir un texto (p. ej. el título), lo que había queda seleccionado para cambiarlo.
  useEffect(() => {
    if (prompt) inputRef.current?.select();
  }, [prompt]);

  // Lo elegido siempre a la vista.
  useLayoutEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [active, sections]);

  const close = () => setOpen(false);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    if (result.kind === 'command') {
      const outcome = result.command.run();
      if (outcome && typeof outcome === 'object') {
        setPrompt(outcome);
        setQuery(outcome.initial);
        return;
      }
      close();
      return;
    }
    close();
    void reveal(result);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const count = results.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (prompt) {
        setPrompt(null);
        setQuery('');
      } else close();
    } else if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.code === 'KeyF')) {
      e.preventDefault();
      close();
    } else if (prompt) {
      if (e.key === 'Enter') {
        e.preventDefault();
        prompt.submit(query);
        close();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (count > 0) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[Math.min(active, count - 1)]);
    }
  };

  let index = 0;
  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={prompt ? prompt.title : 'Buscar y comandos'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {prompt && <p className="palette-prompt-title">{prompt.title}</p>}
        <label className="palette-search">
          {prompt ? (
            <PenLine size={18} strokeWidth={1.75} aria-hidden />
          ) : (
            <Search size={18} strokeWidth={1.75} aria-hidden />
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            placeholder={prompt ? prompt.placeholder : 'Busca en tu diario, un día o qué hacer…'}
            aria-label={prompt ? prompt.title : 'Buscar'}
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </label>

        {!prompt && (
          <div
            ref={listRef}
            className="palette-results"
            role="listbox"
            data-scrollable
            // Que el foco no deje el cuadro de búsqueda al pulsar.
            onMouseDown={(e) => e.preventDefault()}
          >
            {sections.map((section) => (
              <div key={section.title} className="palette-section" role="group">
                <div className="palette-section-title">{section.title}</div>
                {section.results.map((result) => {
                  const i = index++;
                  return (
                    <Row
                      key={result.key}
                      result={result}
                      active={i === Math.min(active, results.length - 1)}
                      onHover={() => setActive(i)}
                      onChoose={() => choose(result)}
                    />
                  );
                })}
              </div>
            ))}
            {searching && <p className="palette-note">Buscando en tu diario…</p>}
            {!searching && results.length === 0 && (
              <p className="palette-note">No hay nada con «{query.trim()}».</p>
            )}
          </div>
        )}

        <footer className="palette-footer">
          {prompt ? (
            <>
              <span>
                <kbd>
                  <CornerDownLeft size={11} strokeWidth={2} aria-label="Enter" />
                </kbd>{' '}
                guardar
              </span>
              <span>
                <kbd>Esc</kbd> volver
              </span>
            </>
          ) : (
            <>
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> elegir
              </span>
              <span>
                <kbd>
                  <CornerDownLeft size={11} strokeWidth={2} aria-label="Enter" />
                </kbd>{' '}
                abrir
              </span>
              <span>
                <kbd>Esc</kbd> cerrar
              </span>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Row({
  result,
  active,
  onHover,
  onChoose,
}: {
  result: Result;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className="palette-row"
      data-active={active || undefined}
      tabIndex={-1}
      onMouseMove={active ? undefined : onHover}
      onClick={onChoose}
    >
      <RowContent result={result} />
    </button>
  );
}

function RowContent({ result }: { result: Result }) {
  switch (result.kind) {
    case 'command': {
      const { command } = result;
      const Icon = command.icon;
      return (
        <>
          <span className="palette-icon">
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="palette-label">{command.label}</span>
          {command.checked && <Check className="palette-check" size={15} strokeWidth={2} />}
          {result.showGroup && <span className="palette-meta">{command.group}</span>}
          {command.keys && (
            <span className="palette-keys">
              {command.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          )}
        </>
      );
    }
    case 'day': {
      const relative = relativeDay(result.date);
      return (
        <>
          <span className="palette-icon">
            <CalendarPlus size={16} strokeWidth={1.75} />
          </span>
          <span className="palette-label">
            Ir al {formatDay(result.date).toLocaleLowerCase('es')}
          </span>
          <span className="palette-meta">{relative ? `${relative} · en blanco` : 'en blanco'}</span>
        </>
      );
    }
    case 'page': {
      const { page } = result;
      return (
        <>
          <span className="page-thumb palette-thumb">
            {page.thumbnail && <img src={page.thumbnail} alt="" draggable={false} />}
          </span>
          <span className="palette-page-text">
            <span className="palette-label">{pageName(page)}</span>
            {page.title && <span className="palette-sub">{formatDay(page.date)}</span>}
          </span>
          {page.bookmark && (
            <span className="palette-bookmark" style={{ background: page.bookmark }} />
          )}
          {relativeDay(page.date) && <span className="palette-meta">{relativeDay(page.date)}</span>}
        </>
      );
    }
    case 'text': {
      const Icon = TEXT_ICONS[result.entry.type] ?? Type;
      return (
        <>
          <span className="palette-icon">
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="palette-label palette-snippet">
            <Marked snippet={result.snippet} />
          </span>
          <span className="palette-meta">{result.place}</span>
        </>
      );
    }
  }
}

/** El trozo de texto con lo encontrado resaltado. */
function Marked({ snippet }: { snippet: Snippet }) {
  const parts = [];
  let at = 0;
  for (const [a, b] of snippet.marks) {
    if (a > at) parts.push(snippet.text.slice(at, a));
    parts.push(<mark key={a}>{snippet.text.slice(a, b)}</mark>);
    at = b;
  }
  parts.push(snippet.text.slice(at));
  return <>{parts}</>;
}

function buildSections(
  query: string,
  commands: Command[],
  pages: PageMeta[],
  current: PageMeta | null,
  texts: TextEntry[] | null,
): Section[] {
  const words = queryWords(query);
  const sections: Section[] = [];
  const push = (title: string, results: Result[]) => {
    if (results.length > 0) sections.push({ title, results });
  };
  const newestFirst = [...pages].sort((a, b) => comparePages(b, a));
  const commandResults = (list: Command[], showGroup = false) =>
    list.map((command): Result => ({ kind: 'command', key: command.id, command, showGroup }));

  if (words.length === 0) {
    push(
      'Recientes',
      [...pages]
        .filter((p) => p.id !== current?.id)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENT_PAGES)
        .map((page) => ({ kind: 'page', key: page.id, page })),
    );
    for (const group of new Set(commands.map((c) => c.group))) {
      push(group, commandResults(commands.filter((c) => c.group === group)));
    }
    return sections;
  }

  // Un día escrito a mano: sus páginas, o ir a él en blanco si aún no tiene.
  const date = parseDayQuery(query, todayKey());
  const ofDay = date ? pagesOfDay(pages, date) : [];
  if (date && ofDay.length === 0) push('Ir a', [{ kind: 'day', key: `day-${date}`, date }]);
  const matching = newestFirst.filter(
    (p) =>
      !ofDay.includes(p) && matchesPrefixes(`${p.title} ${formatDay(p.date)} ${p.date}`, words),
  );
  push(
    'Páginas',
    [...ofDay, ...matching]
      .slice(0, MAX_PAGES)
      .map((page): Result => ({ kind: 'page', key: page.id, page })),
  );

  push(
    'Acciones',
    commandResults(
      commands
        .filter((c) => matchesPrefixes(`${c.label} ${c.group} ${c.keywords ?? ''}`, words))
        // Primero las que lo tienen todo en su nombre ("la del diario" no es "Mapa del diario").
        .map((command) => ({
          command,
          score: words.filter((w) => matchesPrefixes(command.label, [w])).length,
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ command }) => command),
      true,
    ),
  );

  if (texts) {
    const byId = new Map(pages.map((p) => [p.id, p]));
    if (current) byId.set(current.id, current);
    const found: (Result & { kind: 'text' })[] = [];
    for (const entry of texts) {
      const page = byId.get(entry.pageId);
      const desk = entry.pageId === DESK_ID;
      if (!page && !desk) continue;
      const snippet = findInText(entry.text, words);
      if (!snippet) continue;
      const place = desk
        ? 'Mesa'
        : page === current
          ? 'Esta página'
          : page!.title || formatDayMonth(page!.date);
      found.push({
        kind: 'text',
        key: `${entry.pageId}/${entry.elementId}`,
        entry,
        snippet,
        place,
      });
    }
    // Primero la página abierta y la mesa (se ven ya); luego, de lo más nuevo a lo más viejo.
    const rank = (entry: TextEntry) => {
      if (entry.pageId === current?.id) return '~2';
      if (entry.pageId === DESK_ID) return '~1';
      const page = byId.get(entry.pageId)!;
      return `${page.date}-${page.order}`;
    };
    found.sort((a, b) => rank(b.entry).localeCompare(rank(a.entry)));
    push('En tu diario', found.slice(0, MAX_TEXTS));

    // "tareas" o "pendientes": todas las tareas por hacer del diario, primero de todo.
    const asksTasks =
      words.length === 1 &&
      words[0].length >= 3 &&
      ['tareas', 'pendientes'].some((w) => w.startsWith(words[0]));
    if (asksTasks) {
      const pending: Result[] = [];
      for (const entry of [...texts].sort((a, b) => rank(b).localeCompare(rank(a)))) {
        const page = byId.get(entry.pageId);
        const desk = entry.pageId === DESK_ID;
        if (!page && !desk) continue;
        const place = desk
          ? 'Mesa'
          : page === current
            ? 'Esta página'
            : page!.title || formatDayMonth(page!.date);
        entry.text.split('\n').forEach((line, i) => {
          const task = /^\s*\[ \]\s*(.*\S.*)$/.exec(line);
          if (!task) return;
          pending.push({
            kind: 'text',
            key: `${entry.pageId}/${entry.elementId}/${i}`,
            entry,
            snippet: { text: task[1].trim(), marks: [] },
            place,
          });
        });
      }
      if (pending.length > 0) sections.unshift({ title: 'Tareas pendientes', results: pending });
    }
  }
  return sections;
}

/** Lleva a lo elegido: una página, un día o algo escrito (que se ilumina al llegar). */
async function reveal(result: Result) {
  const { diary, engine, diaryState, mapOpen, setMapOpen } = useUI.getState();
  if (!diary || !engine) return;
  if (mapOpen) setMapOpen(false);
  if (result.kind === 'day') await diary.goToDay(result.date);
  else if (result.kind === 'page') await diary.goToPage(result.page.id);
  else if (result.kind === 'text') {
    const { pageId, elementId } = result.entry;
    if (pageId !== DESK_ID && pageId !== diaryState.current?.id) await diary.goToPage(pageId);
    engine.focusElement(elementId);
  }
}
