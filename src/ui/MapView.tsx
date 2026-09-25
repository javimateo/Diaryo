import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { formatMonth, formatShortDay, parseDay, todayKey } from '../lib/dates';
import { sortPages, type PageMeta } from '../diary/pages';
import { PAPER_COLORS, coverColor } from '../engine/book';
import type { PageLink } from '../storage/db';
import { useUI } from '../store/ui';

type Rect = { x: number; y: number; width: number; height: number };

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Lo que tarda la hoja en ir del libro a su sitio en el mapa (y al revés). */
const FLY = 420;

/**
 * Mapa del diario: todas las páginas de un vistazo, por meses, con las conexiones
 * entre ellas (una flecha de cada página a las que enlaza). Clic en una hoja la abre.
 * Al entrar, la doble página abierta se encoge hasta su hoja; al salir, la hoja crece
 * hasta ser el libro.
 */
export function MapView() {
  const open = useUI((s) => s.mapOpen);
  if (!open) return null;
  return <DiaryMap />;
}

/** Transformación que lleva `from` (su caja natural) a ocupar `to`. */
function flip(from: DOMRect, to: Rect): string {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return `translate(${to.x - from.left}px, ${to.y - from.top}px) scale(${sx}, ${sy})`;
}

function DiaryMap() {
  const setOpen = useUI((s) => s.setMapOpen);
  const diary = useUI((s) => s.diary);
  const engine = useUI((s) => s.engine);
  const { pages, current } = useUI((s) => s.diaryState);
  const [links, setLinks] = useState<PageLink[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    let alive = true;
    void diary?.links().then((result) => alive && setLinks(result));
    // Las miniaturas antiguas se rehacen como doble página (se van viendo al terminar).
    void diary?.refreshOldThumbnails();
    return () => {
      alive = false;
    };
  }, [diary]);

  /**
   * Vuelve al libro: la hoja elegida (o la de la página abierta) crece hasta donde
   * estará el libro y el mapa se desvanece dejando ver la página ya cargada debajo.
   */
  const close = (page?: PageMeta) => {
    const root = rootRef.current;
    if (closing.current || !root) return;
    closing.current = true;
    const target = page ?? current;
    // Se carga ya, debajo del mapa (sin pasar las hojas: la hoja del mapa hace de libro).
    if (target && target.id !== current?.id) void diary?.goToPage(target.id, false);
    engine?.showWholeBook();
    const book = engine?.bookScreenRect();
    const sheet = target
      ? root.querySelector<HTMLElement>(`[data-page-id="${target.id}"] .map-sheet`)
      : null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    if (sheet && book && !reduced) {
      // Su hoja pasa por encima de todo (del resto de hojas y de las flechas).
      const card = sheet.closest<HTMLElement>('.map-card')!;
      card.style.zIndex = '5';
      card.dataset.flying = '';
      animations.push(
        sheet.animate(
          [{ transform: 'none' }, { transform: flip(sheet.getBoundingClientRect(), book) }],
          {
            duration: FLY,
            easing: EASE,
            fill: 'forwards',
          },
        ),
      );
      // Todo lo demás (también la hoja que era la actual) se desvanece.
      root.querySelectorAll<HTMLElement>('.map-fade, .map-card').forEach((el) => {
        if (el.contains(sheet)) return;
        animations.push(
          el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }),
        );
      });
      // Al final, el mapa se funde con el libro de verdad, que está en el mismo sitio.
      animations.push(
        root.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], {
          duration: FLY + 160,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      );
    } else {
      animations.push(
        root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }),
      );
    }
    void Promise.all(animations.map((a) => a.finished)).finally(() => setOpen(false));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && !(e.shiftKey && e.code === 'KeyM')) return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  // La página abierta también sale aunque aún esté vacía (así se ve dónde se está).
  const all = sortPages(
    current && !pages.some((p) => p.id === current.id) ? [...pages, current] : pages,
  );

  return (
    <div
      ref={rootRef}
      className="map-view"
      role="dialog"
      aria-label="Mapa del diario"
      onWheel={(e) => {
        // El lienzo de detrás no se mueve; acercarse (Ctrl + rueda) vuelve al libro.
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.deltaY < 0) close();
      }}
    >
      <header className="map-header map-fade">
        <h2>Mapa del diario</h2>
        <span className="map-count">
          {all.length === 1 ? '1 página' : `${all.length} páginas`}
          {links.length > 0 &&
            ` · ${links.length === 1 ? '1 conexión' : `${links.length} conexiones`}`}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Volver al libro"
          data-tip="Volver al libro — Esc"
          data-tip-align="end"
          onClick={() => close()}
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </header>
      <Board pages={all} current={current} links={links} onOpen={close} />
    </div>
  );
}

function Board(props: {
  pages: PageMeta[];
  current: PageMeta | null;
  links: PageLink[];
  onOpen: (page: PageMeta) => void;
}) {
  const { pages, current, links, onOpen } = props;
  const style = useUI((s) => s.bookStyle);
  const theme = useUI((s) => s.theme);
  const origin = useUI((s) => s.mapOrigin);
  const contentRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const today = todayKey();

  // Al abrir: la página actual a la vista, y la hoja sale de donde estaba el libro
  // mientras el resto aparece alrededor.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const sheet = content?.querySelector<HTMLElement>('[data-current] .map-sheet');
    sheet?.scrollIntoView({ block: 'center', inline: 'center' });
    if (!content || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations: Animation[] = [];
    const card = sheet?.closest<HTMLElement>('.map-card');
    if (sheet && card && origin) {
      card.style.zIndex = '5';
      // Mientras vuela no lleva el anillo de "página actual" (se agrandaría con ella).
      card.dataset.flying = '';
      const fly = sheet.animate(
        [{ transform: flip(sheet.getBoundingClientRect(), origin) }, { transform: 'none' }],
        { duration: FLY, easing: EASE },
      );
      const land = () => {
        card.style.zIndex = '';
        delete card.dataset.flying;
      };
      fly.finished.then(land, land);
      animations.push(fly);
      // Su fecha y su título aparecen cuando la hoja ya ha llegado.
      const text = card.querySelector<HTMLElement>('.map-card-text');
      if (text) {
        animations.push(
          text.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 240,
            delay: 260,
            fill: 'backwards',
          }),
        );
      }
    }
    content.querySelectorAll<HTMLElement>('.map-fade').forEach((el) => {
      animations.push(
        el.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 280, delay: 140, easing: EASE, fill: 'backwards' },
        ),
      );
    });
    return () => animations.forEach((a) => a.cancel());
    // Solo al abrir el mapa (el libro de partida no cambia mientras está abierto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Las conexiones se dibujan sobre las hojas ya colocadas (y al cambiar de tamaño).
  useLayoutEffect(() => {
    const content = contentRef.current;
    const svg = svgRef.current;
    if (!content || !svg) return;
    const draw = () => drawLinks(content, svg, links);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(content);
    return () => observer.disconnect();
  }, [links, pages]);

  const groups: { key: string; label: string; pages: PageMeta[] }[] = [];
  for (const page of pages) {
    const key = page.date.slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const date = parseDay(page.date);
      group = { key, label: formatMonth(date.getFullYear(), date.getMonth()), pages: [] };
      groups.push(group);
    }
    group.pages.push(page);
  }

  const paper = (PAPER_COLORS[style.paperColor] ?? PAPER_COLORS.cream)[theme];
  const highlight = (id: string | null) => {
    svgRef.current?.querySelectorAll<SVGPathElement>('.map-link').forEach((path) => {
      const hot = id !== null && (path.dataset.from === id || path.dataset.to === id);
      path.classList.toggle('hot', hot);
    });
  };

  return (
    <div className="map-scroll" data-scrollable>
      <div className="map-content" ref={contentRef}>
        {pages.length === 0 && (
          <p className="map-empty">Aún no hay páginas: escribe algo y aparecerá aquí.</p>
        )}
        {groups.map((group) => (
          <section key={group.key} className="map-month">
            <h3 className="map-fade">{group.label}</h3>
            <div className="map-grid">
              {group.pages.map((page) => {
                const isCurrent = page.id === current?.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={isCurrent ? 'map-card' : 'map-card map-fade'}
                    data-page-id={page.id}
                    data-current={isCurrent || undefined}
                    onClick={() => onOpen(page)}
                    onMouseEnter={() => highlight(page.id)}
                    onMouseLeave={() => highlight(null)}
                    onFocus={() => highlight(page.id)}
                    onBlur={() => highlight(null)}
                  >
                    <span
                      className="map-sheet"
                      style={{ '--paper': paper, '--cover': coverColor(style) } as CSSProperties}
                    >
                      {page.thumbnail && <img src={page.thumbnail} alt="" draggable={false} />}
                      {page.bookmark && (
                        <span className="map-tab" style={{ background: page.bookmark }} />
                      )}
                    </span>
                    <span className="map-card-text">
                      <span className="map-card-day">
                        {formatShortDay(page.date)}
                        {page.date === today && <span className="map-today">hoy</span>}
                      </span>
                      {page.title && <span className="map-card-title">{page.title}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <svg className="map-links map-fade" ref={svgRef} aria-hidden />
      </div>
    </div>
  );
}

/**
 * Una flecha curva de cada página a las que enlaza. Entre hojas de la misma fila, un
 * arco por encima de una a otra; si no, de borde a borde. Se dibuja directamente en
 * el <svg> (depende de dónde quedaron las hojas).
 */
function drawLinks(content: HTMLElement, svg: SVGSVGElement, links: PageLink[]) {
  // Posición de maquetación (relativa al contenido): no cambia con las animaciones,
  // aunque la hoja actual esté aún volando cuando se dibuja.
  const origin = { left: 0, top: 0 };
  const sheets = new Map<string, DOMRect>();
  content.querySelectorAll<HTMLElement>('[data-page-id]').forEach((card) => {
    const sheet = card.querySelector<HTMLElement>('.map-sheet');
    if (!sheet) return;
    sheets.set(
      card.dataset.pageId!,
      new DOMRect(
        card.offsetLeft + sheet.offsetLeft,
        card.offsetTop + sheet.offsetTop,
        sheet.offsetWidth,
        sheet.offsetHeight,
      ),
    );
  });
  svg.setAttribute('width', String(content.scrollWidth));
  svg.setAttribute('height', String(content.scrollHeight));

  const center = (r: DOMRect) => ({
    x: r.left - origin.left + r.width / 2,
    y: r.top - origin.top + r.height / 2,
  });
  /** Punto del borde de la hoja en dirección a `toward`, con un pequeño margen. */
  const edge = (r: DOMRect, toward: { x: number; y: number }, gap: number) => {
    const c = center(r);
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(
      dx ? r.width / 2 / Math.abs(dx) : Infinity,
      dy ? r.height / 2 / Math.abs(dy) : Infinity,
    );
    return { x: c.x + dx * t + (dx / len) * gap, y: c.y + dy * t + (dy / len) * gap };
  };

  const path = (from: string, to: string, d: string) =>
    `<path class="map-link" data-from="${from}" data-to="${to}" d="${d}" marker-end="url(#map-arrow)"/>`;

  const paths = links.flatMap(({ from, to }) => {
    const a = sheets.get(from);
    const b = sheets.get(to);
    if (!a || !b) return [];
    const ca = center(a);
    const cb = center(b);
    if (Math.abs(ca.y - cb.y) < a.height / 2) {
      // Misma fila: sale de la parte de arriba de una hoja (del lado que mira a la otra)
      // y cae sobre la otra. Hacia atrás en el tiempo, algo más alto para no taparse.
      const top = a.top - origin.top;
      const dx = cb.x - ca.x;
      const dir = Math.sign(dx);
      const lift = Math.min(40, 22 + Math.abs(dx) * 0.06) + (dx < 0 ? 12 : 0);
      const sx = ca.x + dir * a.width * 0.22;
      const ex = cb.x - dir * b.width * 0.22;
      const y0 = top - 3;
      const y1 = top - 5;
      return [path(from, to, `M${sx} ${y0} C${sx} ${y0 - lift} ${ex} ${y1 - lift} ${ex} ${y1}`)];
    }
    const start = edge(a, cb, 3);
    const end = edge(b, ca, 5);
    // Curva suave hacia un lado: dos enlaces opuestos no se tapan.
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const bend = Math.min(60, len * 0.15);
    const qx = mx + ((start.y - end.y) / len) * bend;
    const qy = my + ((end.x - start.x) / len) * bend;
    return [path(from, to, `M${start.x} ${start.y} Q${qx} ${qy} ${end.x} ${end.y}`)];
  });
  svg.innerHTML =
    '<defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto"><path d="M1 1 L9 5 L1 9" /></marker></defs>' +
    paths.join('');
}
