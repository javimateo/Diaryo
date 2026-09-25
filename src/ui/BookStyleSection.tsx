import { useState, type CSSProperties } from 'react';
import {
  COVER_COLORS,
  PAPER_COLORS,
  PAPERS,
  paperPreview,
  type Binding,
  type PaperColor,
  type PaperStyle,
} from '../engine/book';
import { MATERIALS, type CoverMaterial } from '../engine/cover';
import { DESKS, deskImage, type DeskStyle } from '../engine/desk';
import { useUI } from '../store/ui';
import { setPagePaper } from './diaryActions';
import { Switch } from './Switch';

export const BINDINGS: Record<Binding, string> = {
  rings: 'Anillas',
  sewn: 'Cosido',
};

const COVER_NAMES = ['Teja', 'Rosa', 'Azul', 'Verde', 'Mostaza', 'Negro'];

/** Ancho de las miniaturas de las hojas (px). */
const PREVIEW_WIDTH = 60;

/**
 * Aspecto del diario: hoja (de todo el diario o solo de esta página), color de hoja,
 * encuadernación, tapas y mesa.
 */
export function BookStyleSection() {
  const style = useUI((s) => s.bookStyle);
  const setBookStyle = useUI((s) => s.setBookStyle);
  const theme = useUI((s) => s.theme);
  const current = useUI((s) => s.diaryState.current);
  const [scope, setScope] = useState<'diary' | 'page'>(() => (current?.paper ? 'page' : 'diary'));
  const pagePaper = current?.paper ?? null;
  const papers = Object.keys(PAPERS) as PaperStyle[];

  const tile = (paper: PaperStyle, label: string, active: boolean, pick: () => void) => (
    <button
      key={label}
      type="button"
      className="style-tile"
      data-active={active || undefined}
      aria-pressed={active}
      onClick={pick}
    >
      <img
        className="paper-preview"
        src={paperPreview(paper, theme, style.paperColor, PREVIEW_WIDTH)}
        alt=""
        draggable={false}
      />
      <span>{label}</span>
    </button>
  );

  return (
    <section className="book-style" aria-label="Aspecto del diario">
      <div className="book-style-head">
        <h3>Hoja</h3>
        <div className="segmented-group" role="group" aria-label="Cambiar la hoja de">
          <button
            type="button"
            className="icon-btn text-option"
            data-active={scope === 'diary' || undefined}
            aria-pressed={scope === 'diary'}
            onClick={() => setScope('diary')}
          >
            Todo el diario
          </button>
          <button
            type="button"
            className="icon-btn text-option"
            data-active={scope === 'page' || undefined}
            aria-pressed={scope === 'page'}
            onClick={() => setScope('page')}
          >
            Esta página
          </button>
        </div>
      </div>
      <div className="style-grid">
        {scope === 'diary'
          ? papers.map((paper) =>
              tile(paper, PAPERS[paper], style.paper === paper, () => setBookStyle({ paper })),
            )
          : [
              tile(style.paper, 'Del diario', pagePaper === null, () => setPagePaper(null)),
              ...papers.map((paper) =>
                tile(paper, PAPERS[paper], pagePaper === paper, () => setPagePaper(paper)),
              ),
            ]}
      </div>

      <h3>Color de hoja</h3>
      <div className="swatch-grid">
        {(Object.keys(PAPER_COLORS) as PaperColor[]).map((id) => (
          <button
            key={id}
            type="button"
            className="swatch"
            data-square
            data-active={style.paperColor === id || undefined}
            style={{ '--swatch': PAPER_COLORS[id][theme] } as CSSProperties}
            aria-label={PAPER_COLORS[id].name}
            aria-pressed={style.paperColor === id}
            data-tip={PAPER_COLORS[id].name}
            onClick={() => setBookStyle({ paperColor: id })}
          />
        ))}
      </div>

      <h3>Encuadernación</h3>
      <div className="segmented-group wide" role="group">
        {(Object.keys(BINDINGS) as Binding[]).map((id) => (
          <button
            key={id}
            type="button"
            className="icon-btn text-option"
            data-active={style.binding === id || undefined}
            aria-pressed={style.binding === id}
            onClick={() => setBookStyle({ binding: id })}
          >
            {BINDINGS[id]}
          </button>
        ))}
      </div>

      <h3>Tapas</h3>
      <div className="segmented-group wide" role="group" aria-label="Material de las tapas">
        {(Object.keys(MATERIALS) as CoverMaterial[]).map((id) => (
          <button
            key={id}
            type="button"
            className="icon-btn text-option"
            data-active={style.material === id || undefined}
            aria-pressed={style.material === id}
            onClick={() => setBookStyle({ material: id })}
          >
            {MATERIALS[id]}
          </button>
        ))}
      </div>
      {style.material === 'kraft' ? (
        <p className="book-style-note">El cartón tiene su propio color.</p>
      ) : (
        <div className="swatch-grid cover-colors">
          {COVER_COLORS.map((color, i) => (
            <button
              key={color}
              type="button"
              className="swatch"
              data-active={style.cover === color || undefined}
              style={{ '--swatch': color } as CSSProperties}
              aria-label={COVER_NAMES[i]}
              aria-pressed={style.cover === color}
              data-tip={COVER_NAMES[i]}
              onClick={() => setBookStyle({ cover: color })}
            />
          ))}
        </div>
      )}
      <label className="book-style-row">
        Goma elástica
        <Switch
          checked={style.elastic}
          label="Goma elástica"
          onChange={(elastic) => setBookStyle({ elastic })}
        />
      </label>

      <h3>Mesa</h3>
      <div className="style-grid">
        {(Object.keys(DESKS) as DeskStyle[]).map((desk) => {
          const image = deskImage(desk, theme);
          return (
            <button
              key={desk}
              type="button"
              className="style-tile"
              data-active={style.desk === desk || undefined}
              aria-pressed={style.desk === desk}
              onClick={() => setBookStyle({ desk })}
            >
              <span
                className="desk-preview"
                style={image ? { backgroundImage: `url(${image})` } : undefined}
              />
              <span>{DESKS[desk]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
