import { useEffect } from 'react';
import { DESK_SCALE, DESK_TILE, deskColor, deskImage } from '../engine/desk';
import { useUI } from '../store/ui';

/** En el mapa, la mesa se ve como de lejos. */
const MAP_SCALE = 0.35;

/**
 * La mesa también fuera del lienzo (en el mapa del diario): su textura y su color como
 * variables de CSS.
 */
export function useDeskBackground() {
  const desk = useUI((s) => s.bookStyle.desk);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement.style;
    const image = deskImage(desk, theme);
    // Sobre una mesa con textura, lo que va suelto encima (el nombre) lleva fondo.
    document.documentElement.toggleAttribute('data-textured-desk', image !== null);
    const color = deskColor(desk, theme);
    if (image && color) {
      root.setProperty('--desk-image', `url(${image})`);
      root.setProperty('--desk-color', color);
      root.setProperty('--desk-size', `${DESK_TILE * DESK_SCALE[desk] * MAP_SCALE}px`);
    } else {
      root.removeProperty('--desk-image');
      root.removeProperty('--desk-color');
      root.removeProperty('--desk-size');
    }
  }, [desk, theme]);
}
