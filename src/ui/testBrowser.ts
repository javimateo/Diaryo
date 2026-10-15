/**
 * For the tests of src/ui (Node, no browser): what the store and the interface's modules
 * read from a browser as they load. Imported first, before them.
 */
globalThis.matchMedia ??= (() => ({
  matches: false,
  addEventListener: () => {},
})) as unknown as typeof matchMedia;
globalThis.HTMLElement ??= class {} as unknown as typeof HTMLElement;
globalThis.document ??= {
  documentElement: { dataset: {}, style: {}, setAttribute: () => {}, toggleAttribute: () => {} },
} as unknown as Document;
