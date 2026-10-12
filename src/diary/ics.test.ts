import { describe, expect, it } from 'vitest';
import type { AgendaItem } from './agenda';
import { calendarFile } from './ics';

const NOW = new Date(2026, 9, 12, 12, 30).getTime();

const item = (text: string, more: Partial<AgendaItem> = {}): AgendaItem => ({
  pageId: 'p',
  elementId: 'e',
  line: 1,
  text,
  task: 'open',
  day: '2026-10-13',
  ...more,
});

/** The value of a property of the first event. */
const field = (file: string, name: string) =>
  file
    .split('\r\n')
    .find((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`))
    ?.replace(/^[^:]*:/, '');

/** The same moment as the file writes it (UTC). */
const utc = (hours: number, minutes = 0) =>
  new Date(2026, 9, 13, hours, minutes).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

describe('calendarFile', () => {
  it('is a calendar with one event each, lines ending in CRLF', () => {
    const file = calendarFile([item('Dentista', { time: 600 }), item('Pan')], NOW);
    expect(file.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(field(file, 'UID')).toBe('p-e-1@diaryo');
  });

  it('places a time in UTC, an hour long without an end', () => {
    const file = calendarFile([item('Dentista', { time: 600 })], NOW);
    expect(field(file, 'DTSTART')).toBe(utc(10));
    expect(field(file, 'DTEND')).toBe(utc(11));
    const range = calendarFile([item('Cena', { time: 21 * 60, until: 23 * 60 + 30 })], NOW);
    expect(field(range, 'DTEND')).toBe(utc(23, 30));
  });

  it('makes a day without a time a whole-day event', () => {
    const file = calendarFile([item('Pan', { day: '2026-12-31' })], NOW);
    expect(file).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(file).toContain('DTEND;VALUE=DATE:20270101\r\n');
  });

  it('escapes the text and folds long lines', () => {
    const file = calendarFile([item('Comprar pan, leche; y más\\ cosas')], NOW);
    expect(field(file, 'SUMMARY')).toBe('Comprar pan\\, leche\\; y más\\\\ cosas');
    const long = calendarFile([item('ñ'.repeat(80))], NOW);
    const lines = long.split('\r\n');
    const summary = lines.findIndex((line) => line.startsWith('SUMMARY:'));
    expect(new TextEncoder().encode(lines[summary]).length).toBeLessThanOrEqual(75);
    expect(lines[summary + 1].startsWith(' ')).toBe(true);
  });
});
