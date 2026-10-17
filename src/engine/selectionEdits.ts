/**
 * The edits of the selection (group, lock, private, copy and paste the style, duplicate,
 * nudge) as plain functions: they get the elements and return the changes, or null if there is
 * nothing to change. The engine commits them to its history.
 */
import { detachMoved } from './arrows';
import {
  createId,
  isLocked,
  type ArrowBinding,
  type NoteElement,
  type SceneElement,
  type TextStyleFlags,
} from './elements';
import { applyStyle, type StylePatch } from './restyle';
import type { Changes } from './scene';
import { translateElement } from './transform';

/** A style copied from an element, and its type (a size only fits the same type). */
export interface CopiedStyle {
  patch: StylePatch;
  type: SceneElement['type'];
}

/** Groups what isn't locked: from now on it is selected and moved together. */
export function group(selected: SceneElement[]): Changes | null {
  const elements = selected.filter((el) => !isLocked(el));
  if (elements.length < 2) return null;
  const groupId = createId();
  return new Map(elements.map((el) => [el.id, { ...el, groupId }]));
}

export function ungroup(selected: SceneElement[]): Changes | null {
  const elements = selected.filter((el) => el.groupId);
  if (elements.length === 0) return null;
  return new Map(elements.map((el) => [el.id, { ...el, groupId: null }]));
}

/** Marks these notes as private, or not (hidden ones don't change: they are locked). */
export function markPrivate(elements: (SceneElement | undefined)[], on: boolean): Changes | null {
  const notes = elements.filter((el): el is NoteElement => el?.type === 'note' && !el.concealed);
  if (notes.length === 0) return null;
  return new Map(
    notes.map((el) => [el.id, on ? { ...el, private: true } : { ...el, private: undefined }]),
  );
}

/** Locks the selection, or unlocks it if everything already was; says which it did. */
export function toggleLock(selected: SceneElement[]): { changes: Changes; locked: boolean } | null {
  if (selected.length === 0) return null;
  const locked = !selected.every((el) => el.locked);
  return { changes: new Map(selected.map((el) => [el.id, { ...el, locked }])), locked };
}

export function unlockAll(all: SceneElement[]): Changes | null {
  const locked = all.filter((el) => el.locked);
  if (locked.length === 0) return null;
  return new Map(locked.map((el) => [el.id, { ...el, locked: false }]));
}

/** An element's style, to paste it on others (sizes in screen px, at this zoom). */
export function copyStyle(el: SceneElement, zoom: number): CopiedStyle {
  const patch: StylePatch = { opacity: el.opacity };
  if (el.type === 'stroke') Object.assign(patch, { color: el.color, size: el.size * zoom });
  if (el.type === 'text') {
    Object.assign(patch, {
      color: el.color,
      size: el.fontSize * zoom,
      font: el.font,
      ...flagPatch(el),
      align: el.align,
    });
  }
  if (el.type === 'note') {
    Object.assign(patch, {
      noteColor: el.color,
      noteVariant: el.variant,
      noteTextColor: el.textColor,
      size: el.fontSize * zoom,
      font: el.font,
      ...flagPatch(el),
      align: el.align,
      valign: el.valign,
    });
  }
  return { patch, type: el.type };
}

export function pasteStyle(selected: SceneElement[], copied: CopiedStyle, zoom: number): Changes {
  const changes: Changes = new Map();
  for (const el of selected) {
    // A stroke width makes no sense as a font size (nor the other way round).
    const { size, ...rest } = copied.patch;
    const patch = el.type === copied.type ? copied.patch : rest;
    void size;
    changes.set(el.id, applyStyle(el, patch, zoom));
  }
  return changes;
}

/** An element's bold, italic and underline as a style change (off ones too, to copy them). */
const flagPatch = (el: TextStyleFlags): StylePatch => ({
  bold: !!el.bold,
  italic: !!el.italic,
  underline: !!el.underline,
});

/**
 * Copies moved by (dx, dy): new ids, on top of everything from `z` in the same order, in
 * new groups (they don't mix with the originals) and unlocked.
 */
export function copies(elements: SceneElement[], dx: number, dy: number, z: number) {
  const groups = new Map<string, string>();
  const groupFor = (id: string | null) => {
    if (!id) return null;
    if (!groups.has(id)) groups.set(id, createId());
    return groups.get(id)!;
  };
  // Copied arrows attach to the copies (or are detached if their element wasn't copied).
  const ids = new Map(elements.map((el) => [el.id, createId()]));
  const rebind = (b: ArrowBinding | null) =>
    b && ids.has(b.elementId) ? { ...b, elementId: ids.get(b.elementId)! } : null;
  return [...elements]
    .sort((a, b) => a.z - b.z)
    .map((el): SceneElement => {
      const copy = {
        ...translateElement(el, dx, dy),
        id: ids.get(el.id)!,
        z: z++,
        groupId: groupFor(el.groupId),
        locked: false,
      };
      return copy.type === 'arrow'
        ? { ...copy, start: rebind(copy.start), end: rebind(copy.end) }
        : copy;
    });
}

/** Moves what isn't locked; arrows let go of what doesn't move with them. */
export function nudge(selected: SceneElement[], dx: number, dy: number): Changes | null {
  const elements = selected.filter((el) => !isLocked(el));
  if (elements.length === 0) return null;
  const moving = new Set(elements.map((el) => el.id));
  return new Map(elements.map((el) => [el.id, detachMoved(translateElement(el, dx, dy), moving)]));
}
