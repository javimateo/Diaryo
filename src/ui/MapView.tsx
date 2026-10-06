import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { parseDay, todayKey } from '../lib/dates';
import { formatMonth, formatShortDay } from '../i18n/dates';
import { sortPages, type PageMeta } from '../diary/pages';
import { PAPER_COLORS, coverColor } from '../engine/book';
import type { PageLink } from '../storage/db';
import { useUI } from '../store/ui';
import { useT } from './useT';

type Rect = { x: number; y: number; width: number; height: number };

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** How long the sheet takes to go from the book to its place on the map (and back). */
const FLY = 420;

/**
 * Diary map: all the pages at a glance, by month, with the connections between them (an
 * arrow from each page to the ones it links to). Clicking a sheet opens it. On entering,
 * the open double page shrinks into its sheet; on leaving, the sheet grows into the book.
 */
export function MapView() {
  const open = useUI((s) => s.mapOpen);
  if (!open) return null;
  return <DiaryMap />;
}

/** Transform that takes `from` (its natural box) to fill `to`. */
function flip(from: DOMRect, to: Rect): string {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return `translate(${to.x - from.left}px, ${to.y - from.top}px) scale(${sx}, ${sy})`;
}

function DiaryMap() {
  const t = useT();
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
    // Old thumbnails are redone as double pages (they show up as they finish).
    void diary?.refreshOldThumbnails();
    return () => {
      alive = false;
    };
  }, [diary]);

  /**
   * Back to the book: the chosen sheet (or the open page's) grows to where the book will
   * be and the map fades out, revealing the page already loaded underneath.
   */
  const close = (page?: PageMeta) => {
    const root = rootRef.current;
    if (closing.current || !root) return;
    closing.current = true;
    const target = page ?? current;
    // It loads right away, under the map (without turning sheets: the map sheet acts as
    // the book).
    if (target && target.id !== current?.id) void diary?.goToPage(target.id, false);
    engine?.showWholeBook();
    const book = engine?.bookScreenRect();
    const sheet = target
      ? root.querySelector<HTMLElement>(`[data-page-id="${target.id}"] .map-sheet`)
      : null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    if (sheet && book && !reduced) {
      // Its sheet goes on top of everything (the other sheets and the arrows).
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
      // Everything else (including the sheet that was the current one) fades out.
      root.querySelectorAll<HTMLElement>('.map-fade, .map-card').forEach((el) => {
        if (el.contains(sheet)) return;
        animations.push(
          el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }),
        );
      });
      // At the end, the map blends into the real book, which is in the same place.
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

  // The open page also shows even if it is still empty (so you can see where you are).
  const all = sortPages(
    current && !pages.some((p) => p.id === current.id) ? [...pages, current] : pages,
  );

  return (
    <div
      ref={rootRef}
      className="map-view"
      role="dialog"
      aria-label={t.zoom.map}
      onWheel={(e) => {
        // The canvas behind doesn't move; zooming in (Ctrl + wheel) goes back to the
        // book.
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.deltaY < 0) close();
      }}
    >
      <header className="map-header map-fade">
        <h2>{t.zoom.map}</h2>
        <span className="map-count">
          {t.diary.pageCount(all.length)}
          {links.length > 0 && ` · ${t.map.links(links.length)}`}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.map.back}
          data-tip={`${t.map.back} — Esc`}
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
  const t = useT();
  const { pages, current, links, onOpen } = props;
  const style = useUI((s) => s.bookStyle);
  const theme = useUI((s) => s.theme);
  const origin = useUI((s) => s.mapOrigin);
  const contentRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const today = todayKey();

  // On opening: the current page in view, and its sheet flies from where the book was
  // while the rest appears around it.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const sheet = content?.querySelector<HTMLElement>('[data-current] .map-sheet');
    sheet?.scrollIntoView({ block: 'center', inline: 'center' });
    if (!content || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations: Animation[] = [];
    const card = sheet?.closest<HTMLElement>('.map-card');
    if (sheet && card && origin) {
      card.style.zIndex = '5';
      // While flying it doesn't have the "current page" ring (it would grow with it).
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
      // Its date and title appear once the sheet has arrived.
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
    // Only when opening the map (the starting book doesn't change while it is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The connections are drawn over the sheets once placed (and on resize).
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
        {pages.length === 0 && <p className="map-empty">{t.map.empty}</p>}
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
                        {page.date === today && <span className="map-today">{t.map.today}</span>}
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
 * A curved arrow from each page to the ones it links to. Between sheets of the same row,
 * an arc over from one to the other; otherwise, edge to edge. It is drawn directly into
 * the <svg> (it depends on where the sheets ended up).
 */
function drawLinks(content: HTMLElement, svg: SVGSVGElement, links: PageLink[]) {
  // Layout position (relative to the content): it doesn't change with the animations,
  // even if the current sheet is still flying when drawn.
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
  /** Point on the sheet's edge in the direction of `toward`, with a small margin. */
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

  // Made as elements, not markup: the pages' ids come from the diary (a backup file, the
  // cloud), and as text they could close the attribute and add their own HTML.
  const path = (from: string, to: string, d: string) => {
    const link = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    link.setAttribute('class', 'map-link');
    link.dataset.from = from;
    link.dataset.to = to;
    link.setAttribute('d', d);
    link.setAttribute('marker-end', 'url(#map-arrow)');
    return link;
  };

  const paths = links.flatMap(({ from, to }) => {
    const a = sheets.get(from);
    const b = sheets.get(to);
    if (!a || !b) return [];
    const ca = center(a);
    const cb = center(b);
    if (Math.abs(ca.y - cb.y) < a.height / 2) {
      // Same row: it leaves from the top of one sheet (the side facing the other) and
      // lands on the other. Backwards in time, a bit higher so they don't overlap.
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
    // Gentle curve to one side: two opposite links don't overlap.
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const bend = Math.min(60, len * 0.15);
    const qx = mx + ((start.y - end.y) / len) * bend;
    const qy = my + ((end.x - start.x) / len) * bend;
    return [path(from, to, `M${start.x} ${start.y} Q${qx} ${qy} ${end.x} ${end.y}`)];
  });
  svg.innerHTML =
    '<defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto"><path d="M1 1 L9 5 L1 9" /></marker></defs>';
  svg.append(...paths);
}
