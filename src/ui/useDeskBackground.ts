import { useEffect } from 'react';
import { DESK_SCALE, DESK_TILE, deskColor } from '../engine/desk';
import { textureImage } from '../engine/textures';
import { useUI } from '../store/ui';

/** On the map, the desk looks as seen from afar. */
const MAP_SCALE = 0.35;

/** The desk outside the canvas too (on the diary map): its texture and color as CSS variables. */
export function useDeskBackground() {
  const desk = useUI((s) => s.bookStyle.desk);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement.style;
    const image =
      desk === 'plain' ? null : textureImage({ kind: 'desk', style: desk, mode: theme });
    // On a textured desk, whatever floats on top (the name) gets a background.
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
