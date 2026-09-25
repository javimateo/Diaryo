import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bandage,
  ArrowUpRight,
  ChevronDown,
  Link2,
  Pencil,
  Unlink,
  Minus,
  MoveHorizontal,
  MoveLeft,
  MoveRight,
  PanelTop,
  Paperclip,
  Pin,
  Square,
  StickyNote,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  clampSize,
  SIZE_RANGES,
  type ArrowHead,
  type FillStyle,
  type Roughness,
  type SizedKind,
  type TextAlign,
  type ToolStyles,
  type VerticalAlign,
} from '../engine/elements';
import { fonts } from '../engine/fonts';
import { NOTE_VARIANT_LABELS, NOTE_VARIANTS, type NoteVariant } from '../engine/notes';
import {
  COLOR_IDS,
  COLOR_LABELS,
  isHexColor,
  NOTE_COLOR_IDS,
  NOTE_COLOR_LABELS,
  NOTE_INK,
  resolveColor,
  resolveNoteColor,
  type Color,
  type HexColor,
  type NoteFill,
} from '../engine/palette';
import type { StylePatch } from '../engine/restyle';
import { useUI } from '../store/ui';
import { ColorPicker } from './ColorPicker';
import { FontPicker, useFonts } from './FontPicker';
import { followLink } from './diaryActions';
import { pageName } from './LinkDialog';
import { Popover } from './Popover';

type ColorValue = Color | NoteFill | 'auto' | 'none';

interface ColorModel {
  label: string;
  /** 'fill' = colores pastel con la opción "sin fondo". */
  palette: 'ink' | 'note' | 'fill';
  /** Valor común de lo que se edita, o null si hay varios distintos. */
  value: ColorValue | null;
  /** Ofrecer "automático" (texto de las notas). */
  allowAuto?: boolean;
  /** Ofrecer quitar el color ("Sin fondo", "Sin borde"). */
  noneLabel?: string;
  translucent?: boolean;
  patchKey: 'color' | 'noteColor' | 'noteTextColor' | 'fill';
}

interface PanelModel {
  /** Estilo del post-it (solo notas). */
  noteVariant?: NoteVariant | null;
  colors: ColorModel[];
  size?: { label: string; kind: SizedKind; value: number | null };
  /** Tipo de relleno (si hay fondo). */
  fillStyle?: FillStyle | null;
  /** Trazo limpio o a mano (rectángulos, elipses y flechas). */
  roughness?: Roughness | null;
  /** Puntas de las flechas. */
  heads?: { start: ArrowHead | null; end: ArrowHead | null };
  /** Tamaño de letra del texto dentro de figuras (px de pantalla). */
  labelSize?: number | null;
  font?: string | null;
  align?: TextAlign | null;
  valign?: VerticalAlign | null;
  opacity: number;
  /** Adónde van los cambios. */
  apply: (patch: StylePatch) => void;
}

/** Si se está escribiendo, devolver el foco al texto después de tocar el panel. */
function refocusEditor() {
  document.querySelector<HTMLTextAreaElement>('.text-editor')?.focus({ preventScroll: true });
}

/** Traduce un cambio del panel a los estilos guardados de una herramienta. */
function toolPatch(tool: keyof ToolStyles, patch: StylePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.size !== undefined) out.size = patch.size;
  if (patch.opacity !== undefined) out.opacity = patch.opacity;
  if (patch.font !== undefined) out.font = patch.font;
  if (patch.align !== undefined) out.align = patch.align;
  if (tool === 'arrow') {
    for (const key of ['color', 'roughness', 'startHead', 'endHead'] as const) {
      if (patch[key] !== undefined && patch[key] !== null) out[key] = patch[key];
    }
    return out;
  }
  if (tool === 'shape') {
    for (const key of ['fill', 'fillStyle', 'roughness', 'labelSize', 'valign'] as const) {
      if (patch[key] !== undefined) out[key] = patch[key];
    }
    // "Sin borde" quita el borde; elegir un color lo devuelve.
    if (patch.color === null) out.border = false;
    else if (patch.color !== undefined) Object.assign(out, { color: patch.color, border: true });
    return out;
  }
  if (tool === 'note') {
    if (patch.noteVariant !== undefined) out.variant = patch.noteVariant;
    if (patch.valign !== undefined) out.valign = patch.valign;
    if (patch.noteColor !== undefined) out.color = patch.noteColor;
    if (patch.noteTextColor !== undefined) out.textColor = patch.noteTextColor;
  } else if (patch.color !== undefined) {
    out.color = patch.color;
  }
  return out;
}

/**
 * Panel lateral de propiedades. Según el contexto cambia el estilo de la herramienta
 * activa (lápiz, marcador, texto, nota), del texto que se está escribiendo o de lo
 * seleccionado.
 */
export function PropertiesPanel() {
  const model = usePanelModel();
  if (!model) return null;
  const { noteVariant, colors, size, fillStyle, roughness, labelSize, heads } = model;
  const { font, align, valign, opacity, apply } = model;

  return (
    <aside
      className="props-panel floating"
      aria-label="Propiedades"
      data-keep-editing
      data-scrollable
    >
      {noteVariant !== undefined && (
        <Section title="Estilo de nota">
          <div className="variant-grid">
            {NOTE_VARIANTS.map((variant) => {
              const Icon = VARIANT_ICONS[variant];
              return (
                <button
                  key={variant}
                  type="button"
                  className="icon-btn"
                  data-active={noteVariant === variant || undefined}
                  aria-label={NOTE_VARIANT_LABELS[variant]}
                  aria-pressed={noteVariant === variant}
                  data-tip={NOTE_VARIANT_LABELS[variant]}
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
        <Section title="Relleno">
          <div className="segmented-group wide" role="group">
            {FILL_STYLES.map(([id, label, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={fillStyle === id || undefined}
                aria-label={label}
                aria-pressed={fillStyle === id}
                data-tip={label}
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
        <Section title="Puntas">
          <div className="segmented-group wide" role="group">
            {HEADS.map(([start, end, label, Icon]) => {
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
        <Section title="Trazado">
          <div className="segmented-group wide" role="group">
            {ROUGHNESS.map(([id, label, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={roughness === id || undefined}
                aria-label={label}
                aria-pressed={roughness === id}
                data-tip={label}
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
        <Section title="Tamaño del texto">
          <SizeControls
            kind="text"
            value={labelSize}
            onChange={(value) => apply({ labelSize: value })}
          />
        </Section>
      )}
      {font !== undefined && (
        <Section title="Fuente">
          <FontButton value={font} onChange={(value) => apply({ font: value })} />
        </Section>
      )}
      {align !== undefined && (
        <Section title="Alineación">
          <div className="segmented">
            <Segmented<TextAlign>
              value={align}
              onChange={(value) => apply({ align: value })}
              options={[
                ['left', 'Izquierda', TextAlignStart],
                ['center', 'Centro', TextAlignCenter],
                ['right', 'Derecha', TextAlignEnd],
              ]}
            />
            {valign !== undefined && (
              <Segmented<VerticalAlign>
                value={valign}
                onChange={(value) => apply({ valign: value })}
                options={[
                  ['top', 'Arriba', AlignVerticalJustifyStart],
                  ['middle', 'En medio', AlignVerticalJustifyCenter],
                  ['bottom', 'Abajo', AlignVerticalJustifyEnd],
                ]}
              />
            )}
          </div>
        </Section>
      )}
      <Section title="Opacidad">
        <div className="opacity-row">
          <input
            type="range"
            className="size-slider"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            aria-label="Opacidad"
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

/** Enlace a otra página de lo seleccionado (solo con la selección, no al escribir). */
function LinkSection() {
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

function usePanelModel(): PanelModel | null {
  const tool = useUI((s) => s.tool);
  const styles = useUI((s) => s.styles);
  const editing = useUI((s) => s.editing);
  const selection = useUI((s) => s.doc.selectionStyle);
  const zoom = useUI((s) => s.zoom);
  const engine = useUI((s) => s.engine);

  const toTool = (name: keyof ToolStyles) => (patch: StylePatch) =>
    useUI.getState().setToolStyle(name, toolPatch(name, patch));

  if (editing) {
    const el = editing.element;
    const kind = el.type === 'note' ? 'note' : el.type === 'text' ? 'text' : 'shape';
    const apply = (patch: StylePatch) => {
      engine?.updateEditingStyle(patch);
      toTool(kind)(patch);
    };
    if (el.type === 'shape' || el.type === 'stroke') {
      const label = el.label!;
      return {
        colors: [ink('Color', el.color)],
        labelSize: label.fontSize * zoom,
        font: label.font,
        align: label.align,
        valign: label.valign,
        opacity: el.opacity,
        apply,
      };
    }
    return el.type === 'note'
      ? {
          noteVariant: el.variant,
          colors: [noteFill(el.color), noteText(el.textColor ?? 'auto')],
          size: { label: 'Tamaño de letra', kind: 'text', value: el.fontSize * zoom },
          font: el.font,
          align: el.align,
          valign: el.valign,
          opacity: el.opacity,
          apply,
        }
      : {
          colors: [ink('Color', el.color)],
          size: { label: 'Tamaño de letra', kind: 'text', value: el.fontSize * zoom },
          font: el.font,
          align: el.align,
          opacity: el.opacity,
          apply,
        };
  }

  if (tool === 'pen' || tool === 'marker') {
    const s = styles[tool];
    return {
      colors: [{ ...ink('Trazo', s.color), translucent: tool === 'marker' }],
      size: { label: 'Grosor', kind: tool, value: s.size },
      opacity: s.opacity,
      apply: toTool(tool),
    };
  }
  if (tool === 'text') {
    const s = styles.text;
    return {
      colors: [ink('Color', s.color)],
      size: { label: 'Tamaño de letra', kind: 'text', value: s.size },
      font: s.font,
      align: s.align,
      opacity: s.opacity,
      apply: toTool('text'),
    };
  }
  if (tool === 'arrow') {
    const s = styles.arrow;
    return {
      colors: [ink('Trazo', s.color)],
      size: { label: 'Grosor', kind: 'pen', value: s.size },
      roughness: s.roughness,
      heads: { start: s.startHead, end: s.endHead },
      opacity: s.opacity,
      apply: toTool('arrow'),
    };
  }
  if (tool === 'rect' || tool === 'ellipse') {
    const s = styles.shape;
    return {
      colors: [border(s.border ? s.color : 'none'), fillColor(s.fill ?? 'none')],
      fillStyle: s.fill ? s.fillStyle : undefined,
      size: { label: 'Grosor', kind: 'pen', value: s.size },
      roughness: s.roughness,
      opacity: s.opacity,
      apply: toTool('shape'),
    };
  }
  if (tool === 'note') {
    const s = styles.note;
    return {
      noteVariant: s.variant,
      colors: [noteFill(s.color), noteText(s.textColor ?? 'auto')],
      size: { label: 'Tamaño de letra', kind: 'text', value: s.size },
      font: s.font,
      align: s.align,
      valign: s.valign,
      opacity: s.opacity,
      apply: toTool('note'),
    };
  }

  if ((tool === 'select' || tool === 'lasso') && selection && engine) {
    const colors: ColorModel[] = [];
    if (selection.hasInk) {
      colors.push(
        selection.inkIsShapes
          ? border(selection.border === false ? 'none' : selection.color)
          : ink(selection.hasText ? 'Color' : 'Trazo', selection.color),
      );
    }
    if (selection.hasFill) colors.push(fillColor(selection.fill));
    if (selection.hasNotes) {
      colors.push(noteFill(selection.noteColor), noteText(selection.noteTextColor));
    }
    const { sizeKind } = selection;
    return {
      noteVariant: selection.hasNotes ? selection.noteVariant : undefined,
      colors,
      size: sizeKind
        ? {
            label: sizeKind === 'text' ? 'Tamaño de letra' : 'Grosor',
            kind: sizeKind,
            value: selection.size === null ? null : selection.size * zoom,
          }
        : undefined,
      fillStyle: selection.hasFill && selection.fill !== 'none' ? selection.fillStyle : undefined,
      roughness: selection.hasShapes || selection.hasArrows ? selection.roughness : undefined,
      heads: selection.hasArrows
        ? { start: selection.startHead, end: selection.endHead }
        : undefined,
      labelSize:
        selection.hasLabels && selection.labelSize !== null
          ? selection.labelSize * zoom
          : undefined,
      font: selection.hasText ? selection.font : undefined,
      align: selection.hasText ? selection.align : undefined,
      valign: selection.hasNotes || selection.hasLabels ? selection.valign : undefined,
      opacity: selection.opacity,
      apply: (patch) => engine.restyleSelection(patch),
    };
  }
  return null;
}

/** Miniaturas de 18 × 18 para los botones de relleno y trazado. */
function Preview({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="2" y="2" width="14" height="14" rx="2" />
      {children}
    </svg>
  );
}

/** Puntas: [inicio, final, nombre, icono]. */
const HEADS: [ArrowHead, ArrowHead, string, LucideIcon][] = [
  ['none', 'arrow', 'Punta al final', MoveRight],
  ['arrow', 'arrow', 'Puntas en los dos lados', MoveHorizontal],
  ['arrow', 'none', 'Punta al principio', MoveLeft],
  ['none', 'none', 'Sin puntas', Minus],
];

const FILL_STYLES: [FillStyle, string, () => ReactNode][] = [
  [
    'solid',
    'Sólido',
    () => (
      <Preview>
        <rect x="2" y="2" width="14" height="14" rx="2" fill="currentColor" />
      </Preview>
    ),
  ],
  [
    'hachure',
    'Rayado',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8" />
      </Preview>
    ),
  ],
  [
    'cross-hatch',
    'Cuadriculado',
    () => (
      <Preview>
        <path d="M3 11l8-8M3 15l12-12M7 15l8-8M7 3l8 8M3 3l12 12M3 7l8 8" />
      </Preview>
    ),
  ],
  [
    'dots',
    'Puntos',
    () => (
      <Preview>
        <path d="M6 6h.01M12 6h.01M9 9h.01M6 12h.01M12 12h.01" strokeWidth="2.4" />
      </Preview>
    ),
  ],
  [
    'zigzag',
    'Zigzag',
    () => (
      <Preview>
        <path d="M3 7l3 3 3-3 3 3 3-3M3 11l3 3 3-3 3 3 3-3" />
      </Preview>
    ),
  ],
];

function Line({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 22 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  );
}

const ROUGHNESS: [Roughness, string, () => ReactNode][] = [
  [0, 'Limpio', () => <Line d="M2 13C7 5 15 5 20 13" />],
  [1, 'A mano', () => <Line d="M2 13c3-6 6-8 9-7s4 3 5 4 3 3 4 3" />],
  [2, 'Muy a mano', () => <Line d="M2 12c2-5 4-2 6-6s3 3 5 1 2-4 4-1 2 5 3 6" />],
];

const VARIANT_ICONS: Record<NoteVariant, LucideIcon> = {
  plain: Square,
  strip: PanelTop,
  pin: Pin,
  tape: Bandage,
  clip: Paperclip,
  curl: StickyNote,
};

const ink = (label: string, value: Color | null): ColorModel => ({
  label,
  palette: 'ink',
  value,
  patchKey: 'color',
});

/** Borde de rectángulos y elipses: un color o ninguno (caja invisible). */
const border = (value: Color | 'none' | null): ColorModel => ({
  ...ink('Borde', null),
  value,
  noneLabel: 'Sin borde',
});

const noteFill = (value: NoteFill | null): ColorModel => ({
  label: 'Nota',
  palette: 'note',
  value,
  patchKey: 'noteColor',
});

const fillColor = (value: NoteFill | 'none' | null): ColorModel => ({
  label: 'Fondo',
  palette: 'fill',
  value,
  noneLabel: 'Sin fondo',
  patchKey: 'fill',
});

const noteText = (value: Color | 'auto' | null): ColorModel => ({
  label: 'Color del texto',
  palette: 'ink',
  value,
  allowAuto: true,
  patchKey: 'noteTextColor',
});

// ─── Piezas ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ColorRow({
  model,
  onPick,
}: {
  model: ColorModel;
  onPick: (value: Color | NoteFill | null) => void;
}) {
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
    palette === 'ink'
      ? COLOR_LABELS[id as keyof typeof COLOR_LABELS]
      : NOTE_COLOR_LABELS[id as keyof typeof NOTE_COLOR_LABELS];

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
          label="Automático"
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
        aria-label="Otro color"
        data-tip="Otro color"
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

function SizeControls(props: {
  kind: SizedKind;
  value: number | null;
  onChange: (size: number) => void;
}) {
  const { kind, value, onChange } = props;
  const range = SIZE_RANGES[kind];
  // El valor puede venir de un zoom cualquiera: se muestra redondeado al paso del rango.
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
        aria-label="Tamaño"
        onChange={(e) => onChange(Number(e.target.value))}
        // Al soltar, devolver el foco (al lienzo o al texto) para que el teclado siga funcionando.
        onPointerUp={(e) => {
          e.currentTarget.blur();
          refocusEditor();
        }}
      />
    </div>
  );
}

/** Campo numérico: se confirma con Enter o al salir; Escape lo deja como estaba. */
function SizeInput({ value, onCommit }: { value: number | null; onCommit: (v: number) => void }) {
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
    <label className="size-input" data-tip="Tamaño exacto — teclas + y −">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="—"
        aria-label="Tamaño en píxeles"
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

function FontButton({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (font: string) => void;
}) {
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
        <span>{value ? fonts.get(value).name : 'Varias'}</span>
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

function Segmented<T extends string>(props: {
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
