import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { clampSize, SIZE_RANGES, type SizedKind, type TextStyleFlags } from '../../engine/elements';
import { fonts } from '../../engine/fonts';
import {
  COLOR_IDS,
  isHexColor,
  NOTE_COLOR_IDS,
  NOTE_INK,
  resolveColor,
  resolveNoteColor,
  type Color,
  type ColorId,
  type HexColor,
  type NoteColor,
  type NoteFill,
} from '../../engine/palette';
import { useUI } from '../../store/ui';
import { ColorPicker } from '../ColorPicker';
import { FontPicker, useFonts } from '../FontPicker';
import { Popover } from '../Popover';
import { refocusEditor, type ColorModel } from './model';
import { useT } from '../useT';

/** The pieces of the properties panel. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function ColorRow({
  model,
  onPick,
}: {
  model: ColorModel;
  onPick: (value: Color | NoteFill | null) => void;
}) {
  const t = useT();
  const theme = useUI((s) => s.theme);
  const addRecentColor = useUI((s) => s.addRecentColor);
  const [customAnchor, setCustomAnchor] = useState<HTMLButtonElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastCustom, setLastCustom] = useState<HexColor | null>(null);
  const { palette, value, allowAuto, translucent, noneLabel } = model;
  const ids: readonly string[] = palette === 'ink' ? COLOR_IDS : NOTE_COLOR_IDS;
  const pastel = palette !== 'ink';
  const custom = isHexColor(value) ? value : null;

  const resolve = (id: string) =>
    palette === 'ink' ? resolveColor(id as Color, theme) : resolveNoteColor(id as NoteFill, theme);
  const label = (id: string) =>
    palette === 'ink' ? t.catalog.colors[id as ColorId] : t.catalog.noteColors[id as NoteColor];

  const closePicker = () => {
    setPickerOpen(false);
    if (lastCustom) addRecentColor(lastCustom);
    refocusEditor();
  };

  return (
    <div className="swatch-grid">
      {allowAuto && (
        <Swatch
          color={NOTE_INK}
          label={t.props.auto}
          active={value === 'auto'}
          auto
          onPick={() => onPick(null)}
        />
      )}
      {noneLabel && (
        <Swatch
          color="transparent"
          label={noneLabel}
          active={value === 'none'}
          none
          onPick={() => onPick(null)}
        />
      )}
      {ids.map((id) => (
        <Swatch
          key={id}
          color={resolve(id)}
          label={label(id)}
          active={value === id}
          translucent={translucent}
          square={pastel}
          onPick={() => onPick(id as Color | NoteFill)}
        />
      ))}
      <button
        ref={setCustomAnchor}
        type="button"
        className="swatch swatch-custom"
        data-active={custom !== null || undefined}
        style={custom ? ({ '--swatch': custom } as CSSProperties) : undefined}
        aria-label={t.props.otherColor}
        data-tip={t.props.otherColor}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
      />
      {pickerOpen && (
        <Popover anchor={customAnchor} onClose={closePicker}>
          <ColorPicker
            value={custom ?? '#6c5ce7'}
            onChange={(hex) => {
              setLastCustom(hex);
              onPick(hex);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

function Swatch(props: {
  color: string;
  label: string;
  active: boolean;
  translucent?: boolean;
  square?: boolean;
  auto?: boolean;
  none?: boolean;
  onPick: () => void;
}) {
  const { color, label, active, translucent, square, auto, none, onPick } = props;
  return (
    <button
      type="button"
      className="swatch"
      data-active={active || undefined}
      data-translucent={translucent || undefined}
      data-square={square || undefined}
      data-auto={auto || undefined}
      data-none={none || undefined}
      style={{ '--swatch': color } as CSSProperties}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
    />
  );
}

export function SizeControls(props: {
  kind: SizedKind;
  value: number | null;
  onChange: (size: number) => void;
}) {
  const t = useT();
  const { kind, value, onChange } = props;
  const range = SIZE_RANGES[kind];
  // The value may come from any zoom: it is shown rounded to the range step.
  const shown = value === null ? null : clampSize(kind, value);

  return (
    <div className="size-controls">
      <div className="size-presets">
        {range.presets.map((size, i) => (
          <button
            key={size}
            type="button"
            className="icon-btn size-btn"
            data-active={shown === size || undefined}
            aria-label={`${size} px`}
            data-tip={`${size} px`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(size)}
          >
            <span className="size-dot" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
          </button>
        ))}
        <SizeInput key={`${kind}-${shown}`} value={shown} onCommit={onChange} />
      </div>
      <input
        type="range"
        className="size-slider"
        min={range.min}
        max={range.max}
        step={range.step}
        value={shown ?? range.min}
        aria-label={t.props.size}
        onChange={(e) => onChange(Number(e.target.value))}
        // On release, give the focus back (to the canvas or the text) so the keyboard
        // keeps working.
        onPointerUp={(e) => {
          e.currentTarget.blur();
          refocusEditor();
        }}
      />
    </div>
  );
}

/** Number field: confirmed with Enter or on leaving; Escape leaves it as it was. */
export function SizeInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const cancelled = useRef(false);

  const commit = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (!cancelled.current && draft.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(value === null ? '' : String(value));
    cancelled.current = false;
    refocusEditor();
  };

  return (
    <label className="size-input" data-tip={t.props.exactSize}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="—"
        aria-label={t.props.sizeInPixels}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      <span>px</span>
    </label>
  );
}

export function FontButton({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (font: string) => void;
}) {
  const t = useT();
  useFonts();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    refocusEditor();
  };

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className="font-button"
        style={value ? { fontFamily: fonts.stack(value) } : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span>{value ? fonts.get(value).name : t.props.mixed}</span>
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} className="font-popover">
          <FontPicker
            value={value}
            onChange={(font) => {
              onChange(font);
              close();
            }}
          />
        </Popover>
      )}
    </>
  );
}

const TEXT_STYLE_KEYS = { bold: 'B', italic: 'I', underline: 'U' } as const;

/**
 * Bold, italic and underline: three buttons that turn on and off on their own (for the
 * whole text), each one drawn as it does.
 */
export function TextStyleToggles({
  value,
  onChange,
}: {
  value: TextStyleFlags;
  onChange: (patch: TextStyleFlags) => void;
}) {
  const t = useT();
  return (
    <div className="segmented-group text-style" role="group" aria-label={t.props.textStyle}>
      {(['bold', 'italic', 'underline'] as const).map((key) => (
        <button
          key={key}
          type="button"
          className="icon-btn"
          data-style={key}
          data-active={value[key] || undefined}
          aria-pressed={!!value[key]}
          aria-label={t.props[key]}
          data-tip={`${t.props[key]} — Ctrl ${TEXT_STYLE_KEYS[key]}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange({ [key]: !value[key] })}
        >
          {t.props.styleKeys[key]}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T | null;
  onChange: (value: T) => void;
  options: [T, string, LucideIcon][];
}) {
  const { value, onChange, options } = props;
  return (
    <div className="segmented-group" role="group">
      {options.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          className="icon-btn"
          data-active={value === id || undefined}
          aria-label={label}
          aria-pressed={value === id}
          data-tip={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(id)}
        >
          <Icon size={16} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}
