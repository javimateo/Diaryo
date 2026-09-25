import RBush from 'rbush';
import { arrowMoved, routeArrow } from './arrows';
import { elementBounds, type ArrowElement, type SceneElement } from './elements';
import { unionBounds, type Bounds } from './geometry';

interface IndexItem extends Bounds {
  id: string;
}

/** Cambios a aplicar: id → nuevo elemento, o `null` para borrarlo. */
export type Changes = Map<string, SceneElement | null>;

/**
 * Los elementos de una página. Los elementos son inmutables: para modificar uno se
 * sustituye por una copia. Un índice espacial (R-tree) permite encontrar rápido
 * los que están en pantalla o bajo el borrador.
 */
export class Scene {
  private readonly elements = new Map<string, SceneElement>();
  private readonly items = new Map<string, IndexItem>();
  private readonly tree = new RBush<IndexItem>();
  private maxZ = 0;
  /** Flechas enganchadas a cada elemento (id del elemento → ids de las flechas). */
  private readonly arrowsOf = new Map<string, Set<string>>();
  /** Se llama con los ids de lo que cambia (lo usa el autoguardado). */
  onChange: (ids: string[]) => void = () => {};

  get size() {
    return this.elements.size;
  }

  get(id: string): SceneElement | undefined {
    return this.elements.get(id);
  }

  /** Todos los elementos, de abajo a arriba. */
  all(): SceneElement[] {
    return [...this.elements.values()].sort((a, b) => a.z - b.z);
  }

  /** Z para un elemento nuevo que quede encima de todo. */
  nextZ(): number {
    return this.maxZ + 1;
  }

  /**
   * Aplica los cambios y devuelve los cambios inversos (para deshacer). Las flechas
   * enganchadas a lo que cambia se recolocan en el mismo paso, así que siguen a sus
   * elementos al moverlos, deshacer o rehacer, y se sueltan si se borran.
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

  /** Elementos que tocan `bounds`, ordenados de abajo a arriba. */
  search(bounds: Bounds): SceneElement[] {
    return this.tree
      .search(bounds)
      .map((item) => this.elements.get(item.id)!)
      .sort((a, b) => a.z - b.z);
  }

  /** Caja que envuelve todo el contenido, o `null` si la página está vacía. */
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
