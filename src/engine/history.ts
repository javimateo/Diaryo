import type { Changes, Scene } from './scene';

const LIMIT = 500;
/** Consecutive changes with the same key (less than this time apart) are undone together. */
const MERGE_WINDOW = 1000;

interface Entry {
  /** Changes that undo (or redo) the action. */
  changes: Changes;
  mergeKey?: string;
  time: number;
}

/**
 * Undo/redo. Each action is stored as its inverse changes: undoing applies the inverse,
 * which in turn returns the inverse to redo.
 */
export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly onChange: () => void,
  ) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Applies an action. With `mergeKey`, if the previous one had the same key and was
   * recent, they merge into one (e.g. dragging the stroke width slider).
   */
  commit(changes: Changes, mergeKey?: string) {
    if (changes.size === 0) return;
    const inverse = this.scene.apply(changes);
    const now = performance.now();
    const last = this.undoStack[this.undoStack.length - 1];

    if (mergeKey && last?.mergeKey === mergeKey && now - last.time < MERGE_WINDOW) {
      // The "before" state of the merged action is the oldest one of each element.
      for (const [id, previous] of inverse) {
        if (!last.changes.has(id)) last.changes.set(id, previous);
      }
      last.time = now;
    } else {
      this.undoStack.push({ changes: inverse, mergeKey, time: now });
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
    this.onChange();
  }

  /** Forgets everything (when loading another page). */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange();
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ changes: this.scene.apply(entry.changes), time: 0 });
    this.onChange();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ changes: this.scene.apply(entry.changes), time: 0 });
    this.onChange();
    return true;
  }
}
