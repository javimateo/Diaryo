import { isClosedStroke } from './containers';
import type { SceneElement, SizedKind } from './elements';
import type { SelectionStyle } from './types';

/**
 * El estilo común de lo seleccionado, para el panel de propiedades: cada campo tiene el
 * valor que comparten todos o null si son distintos. Null si no hay nada seleccionado.
 */
export function selectionStyle(all: SceneElement[]): SelectionStyle | null {
  if (all.length === 0) return null;
  const common = <T>(values: T[]) =>
    values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null;
  const of = <K extends SceneElement['type']>(...types: K[]) =>
    all.filter((el): el is Extract<SceneElement, { type: K }> => types.includes(el.type as K));

  const strokes = of('stroke');
  const shapes = of('shape');
  const texts = of('text');
  const notes = of('note');
  const arrows = of('arrow');
  const ink = [...strokes, ...texts, ...shapes, ...arrows];
  const fillable = [...shapes, ...strokes.filter(isClosedStroke)];
  const labelled = [...shapes, ...strokes].flatMap((el) => (el.label ? [el.label] : []));
  const typed = [...texts, ...notes, ...labelled];

  // El tamaño solo se puede cambiar si todo es del mismo "tipo de tamaño".
  const lined = [...strokes, ...shapes, ...arrows];
  const lettered = [...texts, ...notes];
  const rest = all.length - lined.length - lettered.length - of('image').length;
  let sizeKind: SizedKind | null = null;
  let size: number | null = null;
  if (rest === 0 && lined.length > 0 && lettered.length === 0) {
    sizeKind = strokes.some((el) => el.kind === 'marker') ? 'marker' : 'pen';
    const first = lined[0];
    size = first.type === 'shape' ? first.strokeWidth : first.size;
  } else if (rest === 0 && lettered.length > 0 && lined.length === 0) {
    sizeKind = 'text';
    size = lettered[0].fontSize;
  }

  return {
    hasInk: ink.length > 0,
    color: common(ink.map((el) => el.color)),
    hasNotes: notes.length > 0,
    noteColor: common(notes.map((el) => el.color)),
    noteVariant: common(notes.map((el) => el.variant)),
    noteTextColor: notes.length > 0 ? common(notes.map((el) => el.textColor ?? 'auto')) : null,
    hasText: typed.length > 0,
    font: common(typed.map((t) => t.font)),
    align: common(typed.map((t) => t.align)),
    valign: common([...notes, ...labelled].map((t) => t.valign)),
    hasFill: fillable.length > 0,
    fill: fillable.length > 0 ? common(fillable.map((el) => el.fill ?? 'none')) : null,
    fillStyle: common(fillable.filter((el) => el.fill).map((el) => el.fillStyle)),
    hasShapes: shapes.length > 0,
    hasArrows: arrows.length > 0,
    startHead: common(arrows.map((el) => el.startHead)),
    endHead: common(arrows.map((el) => el.endHead)),
    border: common(shapes.map((el) => el.border)),
    inkIsShapes: shapes.length > 0 && shapes.length === ink.length,
    roughness: common([...shapes, ...arrows].map((el) => el.roughness)),
    hasLabels: labelled.length > 0,
    labelSize: labelled[0]?.fontSize ?? null,
    sizeKind,
    size,
    opacity: all[0].opacity,
  };
}
