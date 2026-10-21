import { addDays, parseDay } from '../lib/dates';
import type { AgendaItem } from './agenda';

/**
 * Tasks and appointments as a calendar file (iCalendar, RFC 5545) to add them to any
 * calendar app. Each one is an event (calendars barely show the file's tasks): the whole
 * day without a time, an hour without an end. Its UID stays the same, so adding it again
 * updates it in the apps that look at it.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "20261013": a day for an all-day event. */
const dateValue = (day: string) => day.replaceAll('-', '');

/** "20261013T080000Z": a moment, in UTC (so every calendar places it right). */
function moment(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** The local moment of a day at some minutes from 0:00. */
function at(day: string, minutes: number): number {
  const date = parseDay(day);
  date.setHours(0, minutes, 0, 0);
  return date.getTime();
}

/**
 * Commas, semicolons, backslashes and line breaks are escaped in a text value (any kind of
 * break: a lone CR ends the line for some apps).
 */
const escapeText = (text: string) =>
  text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r\n|\r|\n/g, '\\n');

/** Lines longer than 75 bytes go on in the next one, which starts with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** The calendar file with these tasks and appointments. */
export function calendarFile(items: AgendaItem[], now: number): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//diaryo//diaryo//ES',
    'CALSCALE:GREGORIAN',
  ];
  for (const item of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.pageId}-${item.elementId}-${item.line}@diaryo`,
      `DTSTAMP:${moment(now)}`,
    );
    if (item.time === undefined) {
      lines.push(
        `DTSTART;VALUE=DATE:${dateValue(item.day)}`,
        `DTEND;VALUE=DATE:${dateValue(addDays(item.day, 1))}`,
      );
    } else {
      lines.push(
        `DTSTART:${moment(at(item.day, item.time))}`,
        `DTEND:${moment(at(item.day, item.until ?? item.time + 60))}`,
      );
    }
    lines.push(`SUMMARY:${escapeText(item.text)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
