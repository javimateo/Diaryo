import { useEffect, useMemo, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { COVER_TEMPLATES, coverTemplate } from '../engine/coverTemplates';
import { fonts } from '../engine/fonts';
import { useUI } from '../store/ui';
import { startCover } from './diaryActions';
import { useFonts } from './FontPicker';
import { useT } from './useT';

/** Width of the template thumbnails (px; drawn at twice that for sharp screens). */
const PREVIEW_WIDTH = 64;

/**
 * The cover in the diary look: how it is now, the button to edit it and the templates to
 * start from (drawn with the covers chosen above).
 */
export function CoverSection() {
  const t = useT();
  const diary = useUI((s) => s.diary);
  const style = useUI((s) => s.bookStyle);
  const [picture, setPicture] = useState<string | null>(null);
  // The previews use the fonts of the templates: drawn again once they load.
  useFonts();
  const fontsVersion = fonts.version;

  useEffect(() => {
    let live = true;
    void diary?.coverPicture().then((image) => live && setPicture(image));
    return () => {
      live = false;
    };
  }, [diary, style]);

  const previews = useMemo(() => {
    if (!diary) return [];
    const year = new Date().getFullYear();
    return COVER_TEMPLATES.map((id) =>
      diary.coverPreview(coverTemplate(id, t.cover.templateTexts, year), PREVIEW_WIDTH * 2),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary, style, t, fontsVersion]);

  return (
    <>
      <h3>{t.cover.title}</h3>
      <div className="cover-now">
        {picture && <img className="cover-picture" src={picture} alt="" />}
        <div className="cover-now-text">
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              useUI.getState().setSettingsOpen(false);
              void diary?.editCover();
            }}
          >
            <PencilLine size={15} strokeWidth={1.75} />
            {t.cover.edit}
          </button>
          <p className="book-style-note">{t.cover.note}</p>
        </div>
      </div>
      <p className="book-style-note">{t.cover.templatesTitle}</p>
      <div className="style-grid">
        {COVER_TEMPLATES.map((id, i) => (
          <button key={id} type="button" className="style-tile" onClick={() => void startCover(id)}>
            {previews[i] && (
              <img className="cover-template" src={previews[i]} alt="" width={PREVIEW_WIDTH} />
            )}
            <span>{t.cover.templates[id]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
