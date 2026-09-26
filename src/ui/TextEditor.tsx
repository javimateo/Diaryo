import { useUI } from '../store/ui';
import { TextEditorView } from './TextEditorView';
import { useT } from './useT';

/** The text editor of the open canvas (see `TextEditorView`). */
export function TextEditor() {
  // Re-renders when the language changes (the editor's label).
  useT();
  const engine = useUI((s) => s.engine);
  const editing = useUI((s) => s.editing);
  const theme = useUI((s) => s.theme);
  return <TextEditorView engine={engine} editing={editing} theme={theme} />;
}
