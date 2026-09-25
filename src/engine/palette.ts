export type ThemeMode = 'light' | 'dark';

export type ColorId = 'ink' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet';

export const COLOR_IDS: ColorId[] = ['ink', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'];

/** Color elegido libremente con el selector: '#rrggbb'. No cambia con el tema. */
export type HexColor = `#${string}`;

/** Un color de la paleta (se adapta al tema) o uno libre. */
export type Color = ColorId | HexColor;

export const isHexColor = (value: unknown): value is HexColor =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const isColor = (value: unknown): value is Color =>
  isHexColor(value) || COLOR_IDS.includes(value as ColorId);

export const COLOR_LABELS: Record<ColorId, string> = {
  ink: 'Tinta',
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  green: 'Verde',
  blue: 'Azul',
  violet: 'Violeta',
};

/**
 * Los colores se guardan por nombre y se resuelven según el tema: la "tinta" es
 * casi negra en claro y casi blanca en oscuro, y el resto se aclara en oscuro.
 */
const PALETTE: Record<ThemeMode, Record<ColorId, string>> = {
  light: {
    ink: '#1f1d1a',
    red: '#e03131',
    orange: '#f08c00',
    yellow: '#f5c400',
    green: '#2f9e44',
    blue: '#1c7ed6',
    violet: '#7048e8',
  },
  dark: {
    ink: '#ecebe8',
    red: '#ff6b6b',
    orange: '#ffa94d',
    yellow: '#ffd43b',
    green: '#69db7c',
    blue: '#4dabf7',
    violet: '#9775fa',
  },
};

export function resolveColor(color: Color, mode: ThemeMode): string {
  return isHexColor(color) ? color : PALETTE[mode][color];
}

// ─── Notas adhesivas ───────────────────────────────────────────

export type NoteColor = 'yellow' | 'orange' | 'pink' | 'violet' | 'blue' | 'green';

export const NOTE_COLOR_IDS: NoteColor[] = ['yellow', 'orange', 'pink', 'violet', 'blue', 'green'];

/** Color de una nota: uno de la paleta pastel o uno libre. */
export type NoteFill = NoteColor | HexColor;

export const isNoteFill = (value: unknown): value is NoteFill =>
  isHexColor(value) || NOTE_COLOR_IDS.includes(value as NoteColor);

export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  yellow: 'Amarillo',
  orange: 'Naranja',
  pink: 'Rosa',
  violet: 'Violeta',
  blue: 'Azul',
  green: 'Verde',
};

/** Tonos pastel; en oscuro algo más apagados para no deslumbrar. */
const NOTE_PALETTE: Record<ThemeMode, Record<NoteColor, string>> = {
  light: {
    yellow: '#ffe98a',
    orange: '#ffcf9e',
    pink: '#ffc4d6',
    violet: '#dccfff',
    blue: '#bfe0ff',
    green: '#c6efc4',
  },
  dark: {
    yellow: '#e6cf6e',
    orange: '#e3ad7b',
    pink: '#e0a3b7',
    violet: '#b9a8e8',
    blue: '#9ec3e6',
    green: '#a5d1a2',
  },
};

/** Color del texto dentro de las notas (siempre oscuro sobre el pastel). */
export const NOTE_INK = '#2b2926';

export function resolveNoteColor(fill: NoteFill, mode: ThemeMode): string {
  return isHexColor(fill) ? fill : NOTE_PALETTE[mode][fill];
}
