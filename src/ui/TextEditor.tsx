import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { worldToScreen, type Camera } from '../engine/camera';
import { toWorld } from '../engine/elements';
import { fonts } from '../engine/fonts';
import { editorBox } from '../engine/render';
import { LINE_HEIGHT } from '../engine/text';
import { useUI } from '../store/ui';
import { continueList, indent, taskShortcut, type TextEdit } from './textEditing';

/**
 * Editor de texto: un <textarea> colocado exactamente encima del texto o la nota
 * que se edita, con la misma letra, tamaño y giro. Mientras tanto el lienzo no pinta
 * ese texto, así que se ve como si se escribiera directamente en él.
 */
export function TextEditor() {
  const engine = useUI((s) => s.engine);
  const editing = useUI((s) => s.editing);
  const theme = useUI((s) => s.theme);
  const [trackedCamera, setCamera] = useState<Camera | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Selección que hay que poner cuando el texto cambiado llegue al <textarea>. */
  const pendingSelection = useRef<TextEdit | null>(null);
  const isEditing = editing !== null;
  const id = editing?.element.id;
  // En el primer render aún no hay suscripción: se usa la cámara actual para que el
  // editor aparezca (y reciba el teclado) en el mismo instante del clic.
  const camera = trackedCamera ?? engine?.getCamera() ?? null;

  // Seguir a la cámara solo mientras se edita.
  useEffect(() => {
    if (!engine || !isEditing) return;
    return engine.subscribe(setCamera);
  }, [engine, isEditing]);

  // Antes de pintar: si el usuario ya está tecleando, ninguna letra se pierde.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [id]);

  // Tras un cambio hecho por el editor (Tab, listas), el cursor va donde toca.
  useLayoutEffect(() => {
    const edit = pendingSelection.current;
    const textarea = ref.current;
    if (!edit || !textarea || textarea.value !== edit.value) return;
    pendingSelection.current = null;
    textarea.setSelectionRange(edit.start, edit.end);
  });

  if (!engine || !editing || !camera) return null;

  const el = editing.element;
  const { zoom } = camera;
  // Caja del texto en coordenadas del elemento (dentro de la nota o de la figura, o la
  // caja entera de un texto libre).
  const box = editorBox(el, theme);
  const origin = worldToScreen(camera, toWorld(el, { x: box.x, y: box.y }));
  const label =
    el.type === 'text' ? 'Texto' : el.type === 'note' ? 'Texto de la nota' : 'Texto de la figura';

  // Un texto sin caja fija no salta de línea: se le deja sitio de sobra para que el
  // navegador (que mide un poco distinto que el lienzo) nunca parta la última palabra.
  const free = el.type === 'text' && !el.wrap;
  const slack = free ? box.fontSize * zoom * 2 : 2;
  const shift = free ? slack * ({ left: 0, center: 0.5, right: 1 } as const)[box.align] : 0;
  const style: CSSProperties = {
    left: origin.x - shift,
    top: origin.y,
    width: box.width * zoom + slack,
    whiteSpace: free ? 'pre' : undefined,
    height: box.height * zoom,
    fontSize: box.fontSize * zoom,
    lineHeight: LINE_HEIGHT,
    fontFamily: fonts.stack(box.font),
    textAlign: box.align,
    color: box.color,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}rad)` : undefined,
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={box.text}
      style={style}
      spellCheck
      aria-label={label}
      onChange={(e) => engine.updateEditingText(e.target.value)}
      onBlur={(e) => {
        // Tocar el panel de estilo (color, tamaño) no cierra el editor.
        const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
        if (next?.closest('[data-keep-editing]')) return;
        engine.finishEditing();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          engine.finishEditing();
          return;
        }
        const { value, selectionStart: start, selectionEnd: end } = e.currentTarget;
        let edit: TextEdit | null = null;
        // Tab no sale del editor: sangra (y Shift+Tab quita la sangría).
        if (e.key === 'Tab') edit = indent(value, start, end, e.shiftKey);
        else if (e.key === 'Enter' && !e.shiftKey && !e.altKey)
          edit = continueList(value, start, end);
        else if (e.key === ' ') edit = taskShortcut(value, start, end);
        if (!edit) return;
        e.preventDefault();
        pendingSelection.current = edit;
        engine.updateEditingText(edit.value);
      }}
    />
  );
}
