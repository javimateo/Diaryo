import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
} from 'react';
import { worldToScreen, type Camera } from '../engine/camera';
import { toWorld } from '../engine/elements';
import { fonts } from '../engine/fonts';
import { editorBox } from '../engine/render';
import { LINE_HEIGHT } from '../engine/text';
import type { EditingState, Engine } from '../engine/engine';
import type { ThemeMode } from '../engine/palette';
import { getLanguage, t as texts } from '../i18n';
import { todayKey } from '../lib/dates';
import { writeDate } from '../lib/when';
import type { DatePickerProps } from './DatePicker';
import {
  continueList,
  dateInProgress,
  indent,
  replaceDate,
  taskShortcut,
  type TextEdit,
} from './textEditing';

interface Props {
  engine: Engine | null;
  editing: EditingState | null;
  theme: ThemeMode;
  /** The picker shown while writing a date after "@" (the app's; the website has none). */
  DatePicker?: ComponentType<DatePickerProps>;
}

/** Room left for the date picker below the text; with less, it goes above. */
const PICKER_HEIGHT = 340;
const PICKER_WIDTH = 264;

/** The keys that, with Ctrl, put the whole text in bold, italic or underlined. */
const STYLE_KEYS: Record<string, 'bold' | 'italic' | 'underline'> = {
  KeyB: 'bold',
  KeyI: 'italic',
  KeyU: 'underline',
};

/**
 * Text editor: a <textarea> placed exactly over the text or note being edited, with the
 * same font, size and rotation. Meanwhile the canvas doesn't draw that text, so it looks
 * like you are writing directly on it. It doesn't read the app's state (the website demo
 * uses it too): `TextEditor` connects it.
 */
export function TextEditorView({ engine, editing, theme, DatePicker }: Props) {
  const t = texts();
  const [trackedCamera, setCamera] = useState<Camera | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Selection to set when the changed text reaches the <textarea>. */
  const pendingSelection = useRef<TextEdit | null>(null);
  /** Where the cursor is (for the date being written) and the date put away with Esc. */
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
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
  const language = getLanguage();

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
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? 'italic' : undefined,
    textDecoration: box.underline ? 'underline' : undefined,
    textAlign: box.align,
    color: box.color,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}rad)` : undefined,
  };

  const apply = (edit: TextEdit) => {
    pendingSelection.current = edit;
    setCaret(edit.end);
    engine.updateEditingText(edit.value);
  };

  // A date after "@" at the cursor: the picker, below the text (above if there's no room).
  const writing = DatePicker
    ? dateInProgress(box.text, caret, todayKey(), language === 'en')
    : null;
  if (!writing && dismissed !== null) setDismissed(null);
  const picking = writing && writing.start !== dismissed ? writing : null;
  const below = origin.y + box.height * zoom + 8;
  const pickerStyle: CSSProperties = {
    left: Math.max(8, Math.min(origin.x - shift, window.innerWidth - PICKER_WIDTH - 8)),
    ...(below + PICKER_HEIGHT < window.innerHeight
      ? { top: below }
      : { top: origin.y - 8, transform: 'translateY(-100%)' }),
  };

  return (
    <>
      <textarea
        ref={ref}
        className="text-editor"
        value={box.text}
        style={style}
        spellCheck
        aria-label={label}
        onChange={(e) => {
          setCaret(e.target.selectionStart);
          engine.updateEditingText(e.target.value);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onBlur={(e) => {
          // Touching the style panel (color, size) doesn't close the editor.
          const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
          if (next?.closest('[data-keep-editing]')) return;
          engine.finishEditing();
        }}
        onKeyDown={(e) => {
          // The date picker: Tab or Enter set what is understood; Esc puts it away.
          if (picking && e.key === 'Escape') {
            e.preventDefault();
            setDismissed(picking.start);
            return;
          }
          const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
          if (picking?.when && plain && (e.key === 'Tab' || e.key === 'Enter')) {
            e.preventDefault();
            const { value, selectionStart } = e.currentTarget;
            const date = writeDate(picking.when, language);
            setDismissed(picking.start);
            apply(replaceDate(value, picking.start, selectionStart, date, true));
            return;
          }
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            engine.finishEditing();
            return;
          }
          // Ctrl B, I, U: the whole text in bold, italic or underlined (only while writing:
          // otherwise Ctrl B opens the index).
          const flag = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && STYLE_KEYS[e.code];
          if (flag) {
            e.preventDefault();
            engine.updateEditingStyle({ [flag]: !box[flag] });
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
          apply(edit);
        }}
      />
      {picking && DatePicker && (
        <DatePicker
          when={picking.when}
          style={pickerStyle}
          onPick={(when) =>
            apply(replaceDate(box.text, picking.start, caret, writeDate(when, language), false))
          }
        />
      )}
    </>
  );
}
