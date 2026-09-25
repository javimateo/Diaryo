import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { formatDay } from '../lib/dates';
import { sortPages, type PageMeta } from '../diary/pages';
import { matchesAll, queryWords } from '../diary/search';
import { useUI } from '../store/ui';

/** Nombre de una página para mostrarla: su título o su fecha. */
export const pageName = (page: PageMeta) => page.title || formatDay(page.date);

/**
 * Elegir la página a la que llevará lo seleccionado. Se busca por título o por fecha
 * ("lunes", "21 septiembre"…); Enter elige la primera.
 */
export function LinkDialog() {
  const open = useUI((s) => s.linkDialogOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const setOpen = useUI((s) => s.setLinkDialogOpen);
  const { pages, current } = useUI((s) => s.diaryState);
  const engine = useUI((s) => s.engine);
  const showToast = useUI((s) => s.showToast);
  const linked = useUI((s) => s.doc.selectionLink);
  const [query, setQuery] = useState('');

  const words = queryWords(query);
  const results = sortPages(pages)
    .reverse()
    .filter((p) => p.id !== current?.id)
    .filter((p) => matchesAll(`${p.title} ${formatDay(p.date)} ${p.date}`, words));

  const close = () => setOpen(false);
  const pick = (page: PageMeta) => {
    engine?.setSelectionLink(page.id);
    close();
    showToast(`Enlazado con ${pageName(page)}`);
  };

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="link-title">Enlazar con una página</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <label className="link-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            autoFocus
            value={query}
            placeholder="Buscar por título o fecha"
            aria-label="Buscar página"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') close();
              if (e.key === 'Enter' && results[0]) pick(results[0]);
            }}
          />
        </label>
        <ul className="link-results" data-scrollable>
          {results.length === 0 && (
            <li className="link-empty">
              {pages.length <= 1
                ? 'Aún no hay otras páginas. Escribe en otro día y podrás enlazarlo.'
                : 'No hay ninguna página con eso.'}
            </li>
          )}
          {results.map((page) => (
            <li key={page.id}>
              <button
                type="button"
                className="link-result"
                data-active={page.id === linked || undefined}
                onClick={() => pick(page)}
              >
                <span className="page-thumb">
                  {page.thumbnail && <img src={page.thumbnail} alt="" draggable={false} />}
                </span>
                <span className="link-result-text">
                  <span className="link-result-title">{pageName(page)}</span>
                  {page.title && <span className="link-result-date">{formatDay(page.date)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
