import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/testBrowser';

// The page's timers (`window.setInterval`), the faked ones.
vi.stubGlobal('window', globalThis);

vi.mock('../desktop/tauri', () => ({
  call: vi.fn(() => Promise.resolve()),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock('./diaryActions', () => ({ revealElement: vi.fn() }));

import { call } from '../desktop/tauri';
import type { AgendaItem } from '../diary/agenda';
import type { Reminder } from '../diary/reminders';
import { DESK_ID } from '../storage/db';
import { useUI } from '../store/ui';
import { startReminders } from './reminders';

// Monday 19 October 2026, 13:39.
const START = new Date(2026, 9, 19, 13, 39).getTime();

const appointment = (text: string, hours: number, minutes: number): AgendaItem => ({
  pageId: DESK_ID,
  elementId: text,
  line: 0,
  text,
  task: null,
  day: '2026-10-19',
  time: hours * 60 + minutes,
});

/** The titles of the last list sent to the desktop side. */
const lastSent = () => {
  const sent = vi.mocked(call).mock.calls.filter(([name]) => name === 'set_reminders');
  const [, args] = sent.at(-1)!;
  return (args as { reminders: Reminder[] }).reminders.map((r) => r.title);
};

let stop: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.mocked(call).mockClear();
  useUI.setState({
    agenda: [],
    settings: { ...useUI.getState().settings, reminders: true, remindBefore: 0 },
  });
  stop = startReminders();
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('the reminders sent to Windows', () => {
  it('include what is written right at its time (or saved just after)', () => {
    useUI.setState({ agenda: [appointment('Probar avisos', 13, 41)] });
    expect(lastSent()).toEqual(['Probar avisos']);
    // Written at 13:40 for 13:40, it arrives a few seconds late: still sent, due at once.
    vi.setSystemTime(START + 65_000);
    useUI.setState({
      agenda: [appointment('Probar avisos', 13, 41), appointment('Probar avisos 2', 13, 40)],
    });
    expect(lastSent()).toEqual(['Probar avisos 2', 'Probar avisos']);
  });

  it('not what was due before diaryo opened (that goes in the missed summary)', () => {
    useUI.setState({ agenda: [appointment('Antes de abrir', 13, 37)] });
    expect(lastSent()).toEqual([]);
  });

  it('not what came due long ago', () => {
    useUI.setState({ agenda: [] });
    vi.setSystemTime(START + 30 * 60_000);
    useUI.setState({ agenda: [appointment('Hace un rato', 13, 50)] });
    expect(lastSent()).toEqual([]);
  });
});
