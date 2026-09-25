import {
  type ArrowHead,
  type FillStyle,
  type Roughness,
  type SizedKind,
  type TextAlign,
  type ToolStyles,
  type VerticalAlign,
} from '../../engine/elements';
import { type NoteVariant } from '../../engine/notes';
import { type Color, type NoteFill } from '../../engine/palette';
import type { StylePatch } from '../../engine/restyle';
import { useUI } from '../../store/ui';

/** Qué enseña el panel de propiedades según el contexto y adónde van los cambios. */

export type ColorValue = Color | NoteFill | 'auto' | 'none';

export interface ColorModel {
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

export interface PanelModel {
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
export function refocusEditor() {
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

export function usePanelModel(): PanelModel | null {
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
