import { ArrowUpRight, Link2, Pencil, Unlink } from 'lucide-react';
import { useUI } from '../../store/ui';
import { followLink } from '../diaryActions';
import { pageName } from '../LinkDialog';
import { Section } from './controls';

/** Enlace a otra página de lo seleccionado (solo con la selección, no al escribir). */
export function LinkSection() {
  const tool = useUI((s) => s.tool);
  const editing = useUI((s) => s.editing);
  const doc = useUI((s) => s.doc);
  const pages = useUI((s) => s.diaryState.pages);
  const engine = useUI((s) => s.engine);
  if (editing || (tool !== 'select' && tool !== 'lasso') || doc.selectionCount === 0) return null;
  const target = doc.selectionLink ? pages.find((p) => p.id === doc.selectionLink) : undefined;
  const openDialog = () => useUI.getState().setLinkDialogOpen(true);

  return (
    <Section title="Enlace">
      {doc.selectionHasLink ? (
        <div className="link-row">
          <button
            type="button"
            className="link-chip"
            data-tip="Ir a esa página"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => doc.selectionLink && void followLink(doc.selectionLink)}
          >
            <ArrowUpRight size={14} strokeWidth={2} />
            <span>
              {target ? pageName(target) : doc.selectionLink ? 'Página borrada' : 'Varias'}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cambiar el enlace"
            data-tip="Cambiar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openDialog}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Quitar el enlace"
            data-tip="Quitar"
            data-tip-align="end"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => engine?.setSelectionLink(null)}
          >
            <Unlink size={14} strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="link-add"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openDialog}
        >
          <Link2 size={15} strokeWidth={1.75} />
          Enlazar con una página
        </button>
      )}
    </Section>
  );
}
