/**
 * For tests that need a real Engine in Node: two canvases whose 2D context takes every
 * call and draws nothing, and the few browser pieces the engine asks for as it starts.
 */
const noop = () => {};

/** Every text drawn on any of these canvases, in order (tests empty it when they need). */
export const drawnTexts: string[] = [];

/** A 2D context that accepts any call or property (it only needs not to break). */
function fakeContext(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {
    fillText: (text: string) => drawnTexts.push(text),
    measureText: (text: string) => ({ width: text.length * 8, actualBoundingBoxAscent: 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({ setTransform: noop }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get: (t, name) => (name in t ? t[name] : noop),
    set: (t, name, value) => {
      t[name] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(): HTMLCanvasElement {
  const context = fakeContext();
  return {
    width: 800,
    height: 600,
    style: {},
    dataset: {},
    getContext: () => context,
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    hasPointerCapture: () => false,
    releasePointerCapture: noop,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    }),
    toDataURL: () => 'data:image/png;base64,',
    toBlob: (done: (blob: Blob) => void) => done(new Blob([], { type: 'image/png' })),
    parentElement: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
  } as unknown as HTMLCanvasElement;
}

globalThis.ResizeObserver ??= class {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
} as unknown as typeof ResizeObserver;
globalThis.ImageData ??= class {} as unknown as typeof ImageData;
globalThis.DOMMatrix ??= class {} as unknown as typeof DOMMatrix;
globalThis.requestAnimationFrame ??= (() => 0) as unknown as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= noop;
globalThis.matchMedia ??= (() => ({
  matches: false,
  addEventListener: noop,
  removeEventListener: noop,
})) as unknown as typeof matchMedia;
globalThis.window ??= {
  devicePixelRatio: 1,
  addEventListener: noop,
  removeEventListener: noop,
} as unknown as Window & typeof globalThis;
globalThis.document ??= {
  createElement: () => fakeCanvas(),
  fonts: { load: () => Promise.resolve([]), add: noop, addEventListener: noop },
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: { dataset: {}, style: {} },
} as unknown as Document;

/** The two canvases an Engine draws on. */
export const testCanvases = () => ({ scene: fakeCanvas(), overlay: fakeCanvas() });
