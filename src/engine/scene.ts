import RBush from 'rbush';
import { arrowMoved, routeArrow } from './arrows';
import { elementBounds, type ArrowElement, type SceneElement } from './elements';
import { unionBounds, type Bounds } from './geometry';

interface IndexItem extends Bounds {
  id: string;
}

/** Changes to apply: id → new element, or `null` to delete it. */
export type Changes = Map<string, SceneElement | null>;

/**
 * The elements of a page. Elements are immutable: to modify one it is replaced by a copy.
 * A spatial index (R-tree) quickly finds the ones on screen or under the eraser.
 */
export class Scene {
  private readonly elements = new Map<string, SceneElement>();
  private readonly items = new Map<string, IndexItem>();
  private readonly tree = new RBush<IndexItem>();
  private maxZ = 0;
  /** Arrows attached to each element (element id → arrow ids). */
  private readonly arrowsOf = new Map<string, Set<string>>();
  /** Called with the ids of what changes (the autosave uses it). */
  onChange: (ids: string[]) => void = () => {};

  get size() {
    return this.elements.size;
  }

  get(id: string): SceneElement | undefined {
    return this.elements.get(id);
  }

  /** All the elements, from bottom to top. */
  all(): SceneElement[] {
    return [...this.elements.values()].sort((a, b) => a.z - b.z);
  }

  /** Z for a new element that ends up on top of everything. */
  nextZ(): number {
    return this.maxZ + 1;
  }

  /**
   * Applies the changes and returns the inverse changes (for undo). Arrows attached to
   * what changes are repositioned in the same step, so they follow their elements when
   * moving, undoing or redoing, and detach if these are deleted.
   */
  apply(changes: Changes): Changes {
    const inverse: Changes = new Map();
    for (const [id, next] of changes) {
      inverse.set(id, this.elements.get(id) ?? null);
      this.remove(id);
      if (next) this.insert(next);
    }
    const touched = [...changes.keys()];
    const affected = new Set<string>();
    for (const id of changes.keys()) {
      const el = this.elements.get(id);
      if (el?.type === 'arrow') affected.add(id);
      this.arrowsOf.get(id)?.forEach((arrowId) => affected.add(arrowId));
    }
    for (const arrowId of affected) {
      const arrow = this.elements.get(arrowId) as ArrowElement | undefined;
      if (arrow?.type !== 'arrow') continue;
      const routed = routeArrow(arrow, (id) => this.elements.get(id));
      if (!arrowMoved(arrow, routed)) continue;
      if (!inverse.has(arrowId)) {
        inverse.set(arrowId, arrow);
        touched.push(arrowId);
      }
      this.remove(arrowId);
      this.insert(routed);
    }
    this.onChange(touched);
    return inverse;
  }

  /** Elements touching `bounds`, sorted from bottom to top. */
  search(bounds: Bounds): SceneElement[] {
    return this.tree
      .search(bounds)
      .map((item) => this.elements.get(item.id)!)
      .sort((a, b) => a.z - b.z);
  }

  /** Box wrapping all the content, or `null` if the page is empty. */
  contentBounds(): Bounds | null {
    let result: Bounds | null = null;
    for (const item of this.items.values()) result = result ? unionBounds(result, item) : item;
    return result && { ...result };
  }

  private insert(el: SceneElement) {
    const item: IndexItem = { ...elementBounds(el), id: el.id };
    if (el.type === 'arrow') {
      for (const binding of [el.start, el.end]) {
        if (!binding) continue;
        let set = this.arrowsOf.get(binding.elementId);
        if (!set) this.arrowsOf.set(binding.elementId, (set = new Set()));
        set.add(el.id);
      }
    }
    this.elements.set(el.id, el);
    this.items.set(el.id, item);
    this.tree.insert(item);
    if (el.z > this.maxZ) this.maxZ = el.z;
  }

  private remove(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    const el = this.elements.get(id);
    if (el?.type === 'arrow') {
      for (const binding of [el.start, el.end]) {
        if (!binding) continue;
        const set = this.arrowsOf.get(binding.elementId);
        set?.delete(id);
        if (set?.size === 0) this.arrowsOf.delete(binding.elementId);
      }
    }
    this.tree.remove(item);
    this.items.delete(id);
    this.elements.delete(id);
  }
}
