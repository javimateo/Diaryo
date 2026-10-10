import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ChevronDown,
  ChevronUp,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { type TextAlign, type VerticalAlign } from '../../engine/elements';
import { resolveColor, resolveNoteColor, type Color, type NoteFill } from '../../engine/palette';
import { NOTE_VARIANTS } from '../../engine/notes';
import type { StylePatch } from '../../engine/restyle';
import {
  ColorRow,
  FontButton,
  Section,
  Segmented,
  SizeControls,
  TextStyleToggles,
  FrameTiles,
} from './controls';
import { Switch } from '../Switch';
import { LinkSection } from './LinkSection';
import { refocusEditor, usePanelModel, type ColorModel } from './model';
import { FILL_STYLES, HEADS, ROUGHNESS, VARIANT_ICONS } from './options';
import { useUI } from '../../store/ui';
import { useT } from '../useT';

/** A phone: the panel starts folded, so it doesn't cover what is being edited. */
const NARROW = '(max-width: 640px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  useEffect(() => {
    const query = matchMedia(NARROW);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** The color shown on the folded panel (the first one being edited). */
function swatchOf(color: ColorModel | undefined, theme: 'light' | 'dark') {
  const value = color?.value;
  if (!color || !value || value === 'auto' || value === 'none') return 'transparent';
  return color.palette === 'ink'
    ? resolveColor(value as Color, theme)
    : resolveNoteColor(value as NoteFill, theme);
}

/**
 * Side properties panel. Depending on the context it changes the style of the active tool
 * (pen, highlighter, text, note), of the text being written or of the selection. On a
 * phone it is a folded pill until it is opened.
 */
export function PropertiesPanel() {
  const t = useT();
  const model = usePanelModel();
  const theme = useUI((s) => s.theme);
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (!model) return null;
  if (narrow && !open) {
    return (
      <button
        type="button"
        className="props-pill floating"
        data-keep-editing
        aria-expanded={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
      >
        <span className="props-swatch" style={{ background: swatchOf(model.colors[0], theme) }} />
        {t.props.style}
        <ChevronUp size={16} strokeWidth={1.75} />
      </button>
    );
  }
  const { noteVariant, colors, size, fillStyle, roughness, labelSize, heads } = model;
  const { font, textStyle, image, align, valign, opacity, apply } = model;

  return (
    <aside
      className="props-panel floating"
      aria-label={t.props.label}
      data-keep-editing
      data-scrollable
    >
      {narrow && (
        <button
          type="button"
          className="props-fold"
          aria-expanded
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(false)}
        >
          {t.props.style}
          <ChevronDown size={16} strokeWidth={1.75} />
        </button>
      )}
      {noteVariant !== undefined && (
        <Section title={t.props.noteStyle}>
          <div className="variant-grid">
            {NOTE_VARIANTS.map((variant) => {
              const Icon = VARIANT_ICONS[variant];
              return (
                <button
                  key={variant}
                  type="button"
                  className="icon-btn"
                  data-active={noteVariant === variant || undefined}
                  aria-label={t.catalog.noteVariants[variant]}
                  aria-pressed={noteVariant === variant}
                  data-tip={t.catalog.noteVariants[variant]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply({ noteVariant: variant })}
                >
                  <Icon size={17} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {colors.map((c) => (
        <Section key={c.patchKey} title={c.label}>
          <ColorRow model={c} onPick={(value) => apply({ [c.patchKey]: value } as StylePatch)} />
        </Section>
      ))}
      {fillStyle !== undefined && (
        <Section title={t.props.fillStyle}>
          <div className="segmented-group wide" role="group">
            {FILL_STYLES.map(([id, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={fillStyle === id || undefined}
                aria-label={t.props.fillStyles[id]}
                aria-pressed={fillStyle === id}
                data-tip={t.props.fillStyles[id]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply({ fillStyle: id })}
              >
                <Preview />
              </button>
            ))}
          </div>
        </Section>
      )}
      {heads && (
        <Section title={t.props.arrowHeads}>
          <div className="segmented-group wide" role="group">
            {HEADS.map(([start, end, kind, Icon]) => {
              const label = t.props.heads[kind];
              const active = heads.start === start && heads.end === end;
              return (
                <button
                  key={label}
                  type="button"
                  className="icon-btn"
                  data-active={active || undefined}
                  aria-label={label}
                  aria-pressed={active}
                  data-tip={label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply({ startHead: start, endHead: end })}
                >
                  <Icon size={17} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {size && (
        <Section title={size.label}>
          <SizeControls {...size} onChange={(value) => apply({ size: value })} />
        </Section>
      )}
      {roughness !== undefined && (
        <Section title={t.props.roughness}>
          <div className="segmented-group wide" role="group">
            {ROUGHNESS.map(([id, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={roughness === id || undefined}
                aria-label={t.props.roughnessNames[id]}
                aria-pressed={roughness === id}
                data-tip={t.props.roughnessNames[id]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply({ roughness: id })}
              >
                <Preview />
              </button>
            ))}
          </div>
        </Section>
      )}
      {labelSize !== undefined && (
        <Section title={t.props.labelSize}>
          <SizeControls
            kind="text"
            value={labelSize}
            onChange={(value) => apply({ labelSize: value })}
          />
        </Section>
      )}
      {font !== undefined && (
        <Section title={t.props.font}>
          <FontButton value={font} onChange={(value) => apply({ font: value })} />
        </Section>
      )}
      {textStyle !== undefined && (
        <Section title={t.props.textStyle}>
          <TextStyleToggles value={textStyle} onChange={(patch) => apply(patch)} />
        </Section>
      )}
      {align !== undefined && (
        <Section title={t.props.align}>
          <div className="segmented">
            <Segmented<TextAlign>
              value={align}
              onChange={(value) => apply({ align: value })}
              options={[
                ['left', t.props.left, TextAlignStart],
                ['center', t.props.center, TextAlignCenter],
                ['right', t.props.right, TextAlignEnd],
              ]}
            />
            {valign !== undefined && (
              <Segmented<VerticalAlign>
                value={valign}
                onChange={(value) => apply({ valign: value })}
                options={[
                  ['top', t.props.top, AlignVerticalJustifyStart],
                  ['middle', t.props.middle, AlignVerticalJustifyCenter],
                  ['bottom', t.props.bottom, AlignVerticalJustifyEnd],
                ]}
              />
            )}
          </div>
        </Section>
      )}
      {image && (
        <Section title={t.props.frame}>
          <FrameTiles value={image.frame} onChange={(frame) => apply({ frame })} />
          <label className="frame-shadow">
            {t.props.shadow}
            <Switch
              checked={image.shadow}
              label={t.props.shadow}
              onChange={(shadow) => apply({ shadow })}
            />
          </label>
        </Section>
      )}
      <Section title={t.props.opacity}>
        <div className="opacity-row">
          <input
            type="range"
            className="size-slider"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            aria-label={t.props.opacity}
            onChange={(e) => apply({ opacity: Number(e.target.value) / 100 })}
            onPointerUp={(e) => {
              e.currentTarget.blur();
              refocusEditor();
            }}
          />
          <span className="opacity-value">{Math.round(opacity * 100)}</span>
        </div>
      </Section>
      <LinkSection />
    </aside>
  );
}
