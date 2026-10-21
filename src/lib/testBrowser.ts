/**
 * For the tests of the interface and its store (Node, no browser): what they read from a
 * browser as they load. Imported first, before them.
 */
globalThis.matchMedia ??= (() => ({
  matches: false,
  addEventListener: () => {},
})) as unknown as typeof matchMedia;
globalThis.HTMLElement ??= class {} as unknown as typeof HTMLElement;
globalThis.document ??= {
  documentElement: { dataset: {}, style: {}, setAttribute: () => {}, toggleAttribute: () => {} },
} as unknown as Document;
