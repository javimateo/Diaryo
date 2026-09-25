import { ArrowUpRight, Link2, Pencil, Unlink } from 'lucide-react';
import { useUI } from '../../store/ui';
import { followLink } from '../diaryActions';
import { pageName } from '../LinkDialog';
import { Section } from './controls';
import { useT } from '../useT';

/** Link from the selection to another page (only with the selection, not while writing). */
export function LinkSection() {
  const t = useT();
  const tool = useUI((s) => s.tool);
  const editing = useUI((s) => s.editing);
  const doc = useUI((s) => s.doc);
  const pages = useUI((s) => s.diaryState.pages);
  const engine = useUI((s) => s.engine);
  if (editing || (tool !== 'select' && tool !== 'lasso') || doc.selectionCount === 0) return null;
  const target = doc.selectionLink ? pages.find((p) => p.id === doc.selectionLink) : undefined;
  const openDialog = () => useUI.getState().setLinkDialogOpen(true);

  return (
    <Section title={t.props.link}>
      {doc.selectionHasLink ? (
        <div className="link-row">
          <button
            type="button"
            className="link-chip"
            data-tip={t.props.goToPage}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => doc.selectionLink && void followLink(doc.selectionLink)}
          >
            <ArrowUpRight size={14} strokeWidth={2} />
            <span>
              {target ? pageName(target) : doc.selectionLink ? t.props.deletedPage : t.props.mixed}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.props.changeLink}
            data-tip={t.props.change}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openDialog}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.props.removeLink}
            data-tip={t.props.remove}
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
          {t.props.addLink}
        </button>
      )}
    </Section>
  );
}
