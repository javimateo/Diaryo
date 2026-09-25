import { describe, expect, it } from 'vitest';
import { addDays, dayKey, monthGrid } from './dates';
import { formatDay, relativeDay, weekdayInitials } from '../i18n/dates';

describe('diary dates', () => {
  it('days in local time, also across months and years', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('names in Spanish', () => {
    expect(formatDay('2026-09-24', '2026-09-24')).toBe('Jueves, 24 de septiembre');
    expect(formatDay('2025-09-24', '2026-09-24')).toBe('Miércoles, 24 de septiembre de 2025');
    expect(relativeDay('2026-09-23', '2026-09-24')).toBe('Ayer');
    expect(relativeDay('2026-09-20', '2026-09-24')).toBeNull();
  });

  it('the calendar starts on Monday', () => {
    // September 2026 starts on a Tuesday.
    const weeks = monthGrid(2026, 8);
    expect(weeks[0]).toEqual([null, '2026-09-01', ...weeks[0].slice(2)]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe('the week can start on Sunday', () => {
  it('changes the leading gap and the initials', () => {
    // Tuesday, September 1, 2026 goes third if the week starts on Sunday.
    expect(monthGrid(2026, 8, 0)[0].slice(0, 3)).toEqual([null, null, '2026-09-01']);
    expect(weekdayInitials(0)).toEqual(['D', 'L', 'M', 'X', 'J', 'V', 'S']);
    expect(weekdayInitials(1)[0]).toBe('L');
  });
});
