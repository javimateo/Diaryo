import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Clip, ClipFrame } from '../engine/clips';
import { Engine, type EngineTheme } from '../engine/engine';

interface Props {
  clip: Clip;
  theme: EngineTheme;
  /** Changing it plays the clip again from the start. */
  run?: number;
  /** Plays again after this pause (ms), over and over (by default, once). */
  loop?: number;
  /** False: it stops where it is (out of view), and starts again when it is true. */
  playing?: boolean;
  className?: string;
  /**
   * Laid over the canvas (e.g. the search palette), animated by its CSS (whose own style
   * is how it ends, for reduced motion).
   */
  children?: ReactNode;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Plays a clip on an engine of its own that nothing can touch: once, staying on its last
 * frame, or in a loop. With reduced motion it shows that last frame straight away.
 */
export function ClipView({
  clip,
  theme,
  run = 0,
  loop,
  playing = true,
  className,
  children,
}: Props) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    // Transparent, for the floating diary's clip (the canvas is small: it costs nothing).
    const instance = new Engine(
      { scene: sceneRef.current!, overlay: overlayRef.current! },
      { embedded: true, transparent: true },
    );
    setEngine(instance);
    return () => instance.destroy();
  }, []);

  useEffect(() => {
    engine?.setTheme(theme);
  }, [engine, theme]);

  // The view: the clip's bounds filling the canvas, again whenever it changes size.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!engine || !canvas) return;
    engine.setTransparentDesk(clip.transparent ?? false);
    const place = () => {
      const { width, height } = canvas.getBoundingClientRect();
      engine.frameInto(clip.bounds, { x: 0, y: 0, width, height }, 4);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [engine, clip]);

  useEffect(() => {
    if (!engine) return;
    let book: ClipFrame['book'] | undefined;
    const show = (frame: ClipFrame) => {
      if (frame.book !== book) engine.setBook((book = frame.book));
      engine.setDeskIds(new Set(frame.desk));
      engine.setElements(frame.elements);
    };
    if (reducedMotion() || clip.duration === 0) {
      show(clip.frame(clip.duration));
      return;
    }
    // Waiting (out of view): its first frame, the book as it starts.
    if (!playing) {
      show(clip.frame(0));
      return;
    }
    let turns = [...(clip.turns ?? [])];
    let turning = false;
    let raf = 0;
    let again = 0;
    let stopped = false;
    let start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      // While a sheet turns, the page under it stays: it changes when it lands.
      if (!turning) show(clip.frame(Math.min(t, clip.duration)));
      const turn = turns[0];
      if (turn && turn.at <= t) {
        turns.shift();
        const after = clip.frame(turn.at + turn.duration);
        turning = true;
        const target = { id: String(turn.at), elements: after.elements, book: after.book! };
        void engine.animatePageTurn(turn.dir, target, turn.duration).then(() => {
          if (stopped) return;
          turning = false;
          show(clip.frame(performance.now() - start));
          engine.endPageTurn();
        });
      }
      if (t < clip.duration || turning || turns.length > 0) raf = requestAnimationFrame(tick);
      else if (loop !== undefined) {
        again = window.setTimeout(() => {
          start = performance.now();
          turns = [...(clip.turns ?? [])];
          tick();
        }, loop);
      }
    };
    tick();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(again);
      engine.endPageTurn();
    };
  }, [engine, clip, run, loop, playing]);

  return (
    <div className={className}>
      <canvas ref={sceneRef} aria-hidden />
      <canvas ref={overlayRef} aria-hidden />
      {children}
    </div>
  );
}
