import { describe, expect, it } from 'vitest';
import { addDays, dayKey, formatDay, monthGrid, relativeDay, weekdayInitials } from './dates';

describe('fechas del diario', () => {
  it('días en hora local, también al cambiar de mes y de año', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('nombres en español', () => {
    expect(formatDay('2026-09-24', '2026-09-24')).toBe('Jueves, 24 de septiembre');
    expect(formatDay('2025-09-24', '2026-09-24')).toBe('Miércoles, 24 de septiembre de 2025');
    expect(relativeDay('2026-09-23', '2026-09-24')).toBe('Ayer');
    expect(relativeDay('2026-09-20', '2026-09-24')).toBeNull();
  });

  it('el calendario empieza en lunes', () => {
    // Septiembre de 2026 empieza en martes.
    const weeks = monthGrid(2026, 8);
    expect(weeks[0]).toEqual([null, '2026-09-01', ...weeks[0].slice(2)]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe('la semana puede empezar en domingo', () => {
  it('cambia el hueco del principio y las iniciales', () => {
    // El martes 1 de septiembre de 2026 va tercero si se empieza en domingo.
    expect(monthGrid(2026, 8, 0)[0].slice(0, 3)).toEqual([null, null, '2026-09-01']);
    expect(weekdayInitials(0)).toEqual(['D', 'L', 'M', 'X', 'J', 'V', 'S']);
    expect(weekdayInitials(1)[0]).toBe('L');
  });
});
