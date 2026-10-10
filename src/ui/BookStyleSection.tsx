import { useState, type CSSProperties } from 'react';
import {
  BINDINGS,
  COVER_COLORS,
  PAPER_COLORS,
  PAPER_STYLES,
  paperPreview,
  type PaperColor,
  type PaperStyle,
} from '../engine/book';
import { MATERIALS, OWN_COLORS } from '../engine/cover';
import { DESKS } from '../engine/desk';
import { texturePreview } from '../engine/textures';
import { useUI } from '../store/ui';
import { setPagePaper } from './diaryActions';
import { Switch } from './Switch';
import { useT } from './useT';

/** Width of the paper thumbnails (px). */
const PREVIEW_WIDTH = 60;

/**
 * Diary look: paper (for the whole diary or only this page), paper color, binding, covers
 * and desk.
 */
export function BookStyleSection() {
  const t = useT();
  const { catalog } = t;
  const style = useUI((s) => s.bookStyle);
  const setBookStyle = useUI((s) => s.setBookStyle);
  const theme = useUI((s) => s.theme);
  const current = useUI((s) => s.diaryState.current);
  const [scope, setScope] = useState<'diary' | 'page'>(() => (current?.paper ? 'page' : 'diary'));
  const pagePaper = current?.paper ?? null;

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
        src={paperPreview(paper, theme, style.paperColor, PREVIEW_WIDTH, t.book)}
        alt=""
        draggable={false}
      />
      <span>{label}</span>
    </button>
  );

  return (
    <section className="book-style" aria-label={t.bookStyle.label}>
      <div className="book-style-head">
        <h3>{t.bookStyle.paper}</h3>
        <div className="segmented-group" role="group" aria-label={t.bookStyle.paperScope}>
          <button
            type="button"
            className="icon-btn text-option"
            data-active={scope === 'diary' || undefined}
            aria-pressed={scope === 'diary'}
            onClick={() => setScope('diary')}
          >
            {t.bookStyle.wholeDiary}
          </button>
          <button
            type="button"
            className="icon-btn text-option"
            data-active={scope === 'page' || undefined}
            aria-pressed={scope === 'page'}
            onClick={() => setScope('page')}
          >
            {t.bookStyle.thisPage}
          </button>
        </div>
      </div>
      <div className="style-grid">
        {scope === 'diary'
          ? PAPER_STYLES.map((paper) =>
              tile(paper, catalog.papers[paper], style.paper === paper, () =>
                setBookStyle({ paper }),
              ),
            )
          : [
              tile(style.paper, t.bookStyle.diaryPaper, pagePaper === null, () =>
                setPagePaper(null),
              ),
              ...PAPER_STYLES.map((paper) =>
                tile(paper, catalog.papers[paper], pagePaper === paper, () => setPagePaper(paper)),
              ),
            ]}
      </div>

      <h3>{t.bookStyle.paperColor}</h3>
      <div className="swatch-grid">
        {(Object.keys(PAPER_COLORS) as PaperColor[]).map((id) => (
          <button
            key={id}
            type="button"
            className="swatch"
            data-square
            data-active={style.paperColor === id || undefined}
            style={{ '--swatch': PAPER_COLORS[id][theme] } as CSSProperties}
            aria-label={catalog.paperColors[id]}
            aria-pressed={style.paperColor === id}
            data-tip={catalog.paperColors[id]}
            onClick={() => setBookStyle({ paperColor: id })}
          />
        ))}
      </div>

      <h3>{t.bookStyle.binding}</h3>
      <div className="segmented-group wide" role="group">
        {BINDINGS.map((id) => (
          <button
            key={id}
            type="button"
            className="icon-btn text-option"
            data-active={style.binding === id || undefined}
            aria-pressed={style.binding === id}
            onClick={() => setBookStyle({ binding: id })}
          >
            {catalog.bindings[id]}
          </button>
        ))}
      </div>

      <h3>{t.bookStyle.cover}</h3>
      <div className="style-grid" role="group" aria-label={t.bookStyle.coverMaterial}>
        {MATERIALS.map((id) => {
          const image = id === 'plain' ? null : texturePreview({ kind: 'cover', material: id }, 96);
          return (
            <button
              key={id}
              type="button"
              className="style-tile"
              data-active={style.material === id || undefined}
              aria-pressed={style.material === id}
              onClick={() => setBookStyle({ material: id })}
            >
              <span
                className="cover-preview"
                data-painted={id === 'marbled' || undefined}
                style={
                  {
                    '--cover': OWN_COLORS[id] ?? style.cover,
                    backgroundImage: image ? `url(${image})` : undefined,
                  } as CSSProperties
                }
              />
              <span>{catalog.materials[id]}</span>
            </button>
          );
        })}
      </div>
      {OWN_COLORS[style.material] ? (
        <p className="book-style-note">{t.bookStyle.ownColorNote}</p>
      ) : (
        <div className="swatch-grid cover-colors">
          {COVER_COLORS.map((color, i) => (
            <button
              key={color}
              type="button"
              className="swatch"
              data-active={style.cover === color || undefined}
              style={{ '--swatch': color } as CSSProperties}
              aria-label={catalog.coverColors[i]}
              aria-pressed={style.cover === color}
              data-tip={catalog.coverColors[i]}
              onClick={() => setBookStyle({ cover: color })}
            />
          ))}
        </div>
      )}
      <label className="book-style-row">
        {t.bookStyle.elastic}
        <Switch
          checked={style.elastic}
          label={t.bookStyle.elastic}
          onChange={(elastic) => setBookStyle({ elastic })}
        />
      </label>

      <h3>{t.bookStyle.desk}</h3>
      <div className="style-grid">
        {DESKS.map((desk) => {
          const image =
            desk === 'plain'
              ? null
              : texturePreview({ kind: 'desk', style: desk, mode: theme }, 128);
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
              <span>{catalog.desks[desk]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
