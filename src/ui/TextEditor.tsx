import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { worldToScreen, type Camera } from '../engine/camera';
import { toWorld } from '../engine/elements';
import { fonts } from '../engine/fonts';
import { editorBox } from '../engine/render';
import { LINE_HEIGHT } from '../engine/text';
import { useUI } from '../store/ui';
import { continueList, indent, taskShortcut, type TextEdit } from './textEditing';
import { useT } from './useT';

/**
 * Text editor: a <textarea> placed exactly over the text or note being edited, with the
 * same font, size and rotation. Meanwhile the canvas doesn't draw that text, so it looks
 * like you are writing directly on it.
 */
export function TextEditor() {
  const t = useT();
  const engine = useUI((s) => s.engine);
  const editing = useUI((s) => s.editing);
  const theme = useUI((s) => s.theme);
  const [trackedCamera, setCamera] = useState<Camera | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Selection to set when the changed text reaches the <textarea>. */
  const pendingSelection = useRef<TextEdit | null>(null);
  const isEditing = editing !== null;
  const id = editing?.element.id;
  // On the first render there is no subscription yet: the current camera is used so the
  // editor appears (and takes the keyboard) at the very moment of the click.
  const camera = trackedCamera ?? engine?.getCamera() ?? null;

  // Follow the camera only while editing.
  useEffect(() => {
    if (!engine || !isEditing) return;
    return engine.subscribe(setCamera);
  }, [engine, isEditing]);

  // Before painting: if the user is already typing, no letter is lost.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [id]);

  // After a change made by the editor (Tab, lists), the cursor goes where it should.
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
  // Text box in element coordinates (inside the note or shape, or the whole box of a free
  // text).
  const box = editorBox(el, theme);
  const origin = worldToScreen(camera, toWorld(el, { x: box.x, y: box.y }));
  const label = t.editor[el.type === 'text' ? 'text' : el.type === 'note' ? 'note' : 'shape'];

  // A text without a fixed box doesn't wrap: it gets plenty of room so the browser (which
  // measures slightly differently from the canvas) never breaks the last word.
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
        // Touching the style panel (color, size) doesn't close the editor.
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
        // Tab doesn't leave the editor: it indents (and Shift+Tab outdents).
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
