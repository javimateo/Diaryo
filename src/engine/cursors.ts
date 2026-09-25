function svgCursor(svg: string, hotspot: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, ${fallback}`;
}

/** Punto del tamaño y color del trazo, con un borde para verse sobre cualquier fondo. */
export function brushCursor(diameter: number, color: string, opacity: number, contrast: string) {
  // Los navegadores ignoran cursores de más de 128 px.
  const d = Math.max(4, Math.min(diameter, 120));
  const size = Math.ceil(d + 4);
  const c = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${d / 2 + 0.75}" fill="none" stroke="${contrast}" stroke-opacity="0.5" stroke-width="1"/>` +
    `<circle cx="${c}" cy="${c}" r="${d / 2}" fill="${color}" fill-opacity="${opacity}"/>` +
    `</svg>`;
  return svgCursor(svg, Math.round(c), 'crosshair');
}

/** Flecha circular para el asa de girar. */
export const ROTATE_CURSOR = (() => {
  const arrow =
    '<path d="M19 12a7 7 0 1 1-7-7c1.96 0 3.83.78 5.24 2.13L19 9"/><path d="M19 4v5h-5"/>';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<g stroke="#fff" stroke-width="4">${arrow}</g>` +
    `<g stroke="#000" stroke-width="1.75">${arrow}</g>` +
    `</svg>`;
  return svgCursor(svg, 12, 'grab');
})();

/** Círculo hueco del tamaño del borrador. */
export function eraserCursor(radius: number, color: string) {
  const size = radius * 2 + 4;
  const c = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.6" stroke-width="1.25"/>` +
    `</svg>`;
  return svgCursor(svg, Math.round(c), 'cell');
}
