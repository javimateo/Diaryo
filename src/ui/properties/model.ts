import {
  type ArrowHead,
  type FillStyle,
  type Roughness,
  type SizedKind,
  type TextAlign,
  type TextStyleFlags,
  type ToolStyles,
  type VerticalAlign,
} from '../../engine/elements';
import { type NoteVariant } from '../../engine/notes';
import { type Color, type NoteFill } from '../../engine/palette';
import type { StylePatch } from '../../engine/restyle';
import { useUI } from '../../store/ui';
import { t } from '../../i18n';

/** What the properties panel shows depending on the context and where the changes go. */

export type ColorValue = Color | NoteFill | 'auto' | 'none';

export interface ColorModel {
  label: string;
  /** 'fill' = pastel colors with the "no fill" option. */
  palette: 'ink' | 'note' | 'fill';
  /** Common value of what is being edited, or null if there are several different ones. */
  value: ColorValue | null;
  /** Offer "automatic" (note text). */
  allowAuto?: boolean;
  /** Offer removing the color ("No fill", "No border"). */
  noneLabel?: string;
  translucent?: boolean;
  patchKey: 'color' | 'noteColor' | 'noteTextColor' | 'fill';
}

export interface PanelModel {
  /** Sticky note style (notes only). */
  noteVariant?: NoteVariant | null;
  colors: ColorModel[];
  size?: { label: string; kind: SizedKind; value: number | null };
  /** Fill type (if there is a fill). */
  fillStyle?: FillStyle | null;
  /** Clean or hand-drawn stroke (rectangles, ellipses and arrows). */
  roughness?: Roughness | null;
  /** Arrowheads. */
  heads?: { start: ArrowHead | null; end: ArrowHead | null };
  /** Font size of the text inside shapes (screen px). */
  labelSize?: number | null;
  font?: string | null;
  /** Bold, italic and underline of the whole text (on only if every text has it). */
  textStyle?: TextStyleFlags;
  align?: TextAlign | null;
  valign?: VerticalAlign | null;
  opacity: number;
  /** Where the changes go. */
  apply: (patch: StylePatch) => void;
}

/** While writing, give the focus back to the text after touching the panel. */
export function refocusEditor() {
  document.querySelector<HTMLTextAreaElement>('.text-editor')?.focus({ preventScroll: true });
}

/** Translates a panel change into a tool's saved styles. */
function toolPatch(tool: keyof ToolStyles, patch: StylePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.size !== undefined) out.size = patch.size;
  if (patch.opacity !== undefined) out.opacity = patch.opacity;
  if (patch.font !== undefined) out.font = patch.font;
  if (patch.align !== undefined) out.align = patch.align;
  // New texts and notes come out in bold, italic or underlined if the tool is set so.
  if (tool === 'text' || tool === 'note') {
    for (const key of ['bold', 'italic', 'underline'] as const) {
      if (patch[key] !== undefined) out[key] = patch[key] || undefined;
    }
  }
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
    // "No border" removes the border; choosing a color brings it back.
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

export function usePanelModel(): PanelModel | null {
  useUI((s) => s.settings.language);
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
        colors: [ink(t().props.color, el.color)],
        labelSize: label.fontSize * zoom,
        font: label.font,
        textStyle: flags(label),
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
          size: { label: t().props.fontSize, kind: 'text', value: el.fontSize * zoom },
          font: el.font,
          textStyle: flags(el),
          align: el.align,
          valign: el.valign,
          opacity: el.opacity,
          apply,
        }
      : {
          colors: [ink(t().props.color, el.color)],
          size: { label: t().props.fontSize, kind: 'text', value: el.fontSize * zoom },
          font: el.font,
          textStyle: flags(el),
          align: el.align,
          opacity: el.opacity,
          apply,
        };
  }

  if (tool === 'pen' || tool === 'marker') {
    const s = styles[tool];
    return {
      colors: [{ ...ink(t().props.stroke, s.color), translucent: tool === 'marker' }],
      size: { label: t().props.thickness, kind: tool, value: s.size },
      opacity: s.opacity,
      apply: toTool(tool),
    };
  }
  if (tool === 'text') {
    const s = styles.text;
    return {
      colors: [ink(t().props.color, s.color)],
      size: { label: t().props.fontSize, kind: 'text', value: s.size },
      font: s.font,
      textStyle: flags(s),
      align: s.align,
      opacity: s.opacity,
      apply: toTool('text'),
    };
  }
  if (tool === 'arrow') {
    const s = styles.arrow;
    return {
      colors: [ink(t().props.stroke, s.color)],
      size: { label: t().props.thickness, kind: 'pen', value: s.size },
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
      size: { label: t().props.thickness, kind: 'pen', value: s.size },
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
      size: { label: t().props.fontSize, kind: 'text', value: s.size },
      font: s.font,
      textStyle: flags(s),
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
          : ink(selection.hasText ? t().props.color : t().props.stroke, selection.color),
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
            label: sizeKind === 'text' ? t().props.fontSize : t().props.thickness,
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
      textStyle: selection.hasText ? flags(selection) : undefined,
      align: selection.hasText ? selection.align : undefined,
      valign: selection.hasNotes || selection.hasLabels ? selection.valign : undefined,
      opacity: selection.opacity,
      apply: (patch) => engine.restyleSelection(patch),
    };
  }
  return null;
}

const flags = ({ bold, italic, underline }: TextStyleFlags): TextStyleFlags => ({
  bold: !!bold,
  italic: !!italic,
  underline: !!underline,
});

const ink = (label: string, value: Color | null): ColorModel => ({
  label,
  palette: 'ink',
  value,
  patchKey: 'color',
});

/** Border of rectangles and ellipses: a color or none (invisible box). */
const border = (value: Color | 'none' | null): ColorModel => ({
  ...ink(t().props.border, null),
  value,
  noneLabel: t().props.noBorder,
});

const noteFill = (value: NoteFill | null): ColorModel => ({
  label: t().props.note,
  palette: 'note',
  value,
  patchKey: 'noteColor',
});

const fillColor = (value: NoteFill | 'none' | null): ColorModel => ({
  label: t().props.fill,
  palette: 'fill',
  value,
  noneLabel: t().props.noFill,
  patchKey: 'fill',
});

const noteText = (value: Color | 'auto' | null): ColorModel => ({
  label: t().props.textColor,
  palette: 'ink',
  value,
  allowAuto: true,
  patchKey: 'noteTextColor',
});
