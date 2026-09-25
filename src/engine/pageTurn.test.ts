import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOK_STYLE, PAGE_HEIGHT, PAGE_WIDTH } from './book';
import { PageTurner, type TurnTarget } from './pageTurn';

const W = PAGE_WIDTH;
const BOTTOM = PAGE_HEIGHT / 2;

const target = (id: string): TurnTarget => ({
  id,
  elements: [],
  book: {
    style: DEFAULT_BOOK_STYLE,
    date: '',
    title: '',
    today: false,
    pageNumber: 1,
    tabs: [],
  },
});

function setup(prev = true, next = true) {
  const onTurn = vi.fn();
  const turner = new PageTurner({
    renderTexture: () => ({}) as HTMLCanvasElement,
    invalidate: () => {},
    onTurn,
  });
  turner.setTargets(prev ? target('prev') : null, next ? target('next') : null);
  /** Deja terminar la animación en curso. */
  const finish = () => turner.step(performance.now() + 10_000);
  return { turner, onTurn, finish };
}

describe('pasar página arrastrando la esquina', () => {
  it('solo se agarran las esquinas de fuera, y solo si hay página a ese lado', () => {
    const { turner } = setup(false, true);
    expect(turner.cornerAt({ x: W - 20, y: BOTTOM - 20 }, 1)?.dir).toBe(1);
    expect(turner.cornerAt({ x: W / 2, y: 0 }, 1)).toBeNull();
    // Sin página anterior, las esquinas de la izquierda no hacen nada.
    expect(turner.cornerAt({ x: -W + 20, y: BOTTOM - 20 }, 1)).toBeNull();
  });

  it('soltada pasada la mitad, la hoja cae y se abre la página', () => {
    const { turner, onTurn, finish } = setup();
    expect(turner.grab({ x: W - 10, y: BOTTOM - 10 }, 1)).toBe(true);
    turner.drag({ x: -W / 2, y: BOTTOM - 100 });
    turner.release();
    expect(turner.busy).toBe(true);
    finish();
    expect(onTurn).toHaveBeenCalledWith(1);
    // Se queda caída hasta que la nueva página está cargada.
    expect(turner.active).toBe(true);
    turner.end();
    expect(turner.active).toBe(false);
  });

  it('soltada antes de la mitad, vuelve a su sitio', () => {
    const { turner, onTurn, finish } = setup();
    turner.grab({ x: -W + 10, y: BOTTOM - 10 }, 1);
    turner.drag({ x: -W * 0.8, y: BOTTOM - 50 });
    turner.release();
    finish();
    expect(onTurn).not.toHaveBeenCalled();
    expect(turner.active).toBe(false);
  });

  it('la hoja no se separa del lomo', () => {
    const { turner } = setup();
    turner.grab({ x: W - 10, y: BOTTOM - 10 }, 1);
    // Muy lejos a la derecha: la esquina no puede alejarse del lomo más que el ancho.
    turner.drag({ x: W * 3, y: BOTTOM });
    const point = (turner as unknown as { curl: { point: { x: number; y: number } } }).curl.point;
    expect(Math.hypot(point.x, point.y - BOTTOM)).toBeLessThanOrEqual(W + 1e-6);
  });
});
