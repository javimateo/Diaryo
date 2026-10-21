import type { CSSProperties } from 'react';
import { todayKey } from '../lib/dates';
import type { When } from '../lib/when';
import { formatClock, formatWhenLong } from '../i18n/dates';
import { MonthCalendar } from './MonthCalendar';
import { useT } from './useT';

/** The times offered (minutes from 0:00); any other one is written. */
const TIMES = [9 * 60, 12 * 60, 17 * 60, 20 * 60];

export interface DatePickerProps {
  /** What the date being written means so far (null: nothing yet). */
  when: When | null;
  style: CSSProperties;
  /** A day or a time picked with the mouse. */
  onPick: (when: When) => void;
}

/**
 * Under a text where "@" is being written: what the date means, a month and some times.
 * It never takes the keyboard (the text keeps it): Tab or Enter set what is understood.
 */
export function DatePicker({ when, style, onPick }: DatePickerProps) {
  const t = useT();
  const today = todayKey();
  const day = when?.day ?? today;
  return (
    <div
      className="date-picker floating"
      style={style}
      role="dialog"
      aria-label={t.datePicker.label}
      data-keep-editing
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="date-picker-head" aria-live="polite">
        {when ? (
          <>
            <strong>{formatWhenLong(when, today)}</strong>
            <span>
              <kbd>Tab</kbd> {t.datePicker.accept}
            </span>
          </>
        ) : (
          t.datePicker.hint
        )}
      </p>
      <MonthCalendar selected={day} onPick={(picked) => onPick({ ...when, day: picked })} />
      <div className="segmented-group wide" role="group">
        <button
          type="button"
          className="icon-btn text-option"
          data-active={(!!when && when.time === undefined) || undefined}
          onClick={() => onPick({ day })}
        >
          {t.datePicker.noTime}
        </button>
        {TIMES.map((time) => (
          <button
            key={time}
            type="button"
            className="icon-btn text-option"
            data-active={when?.time === time || undefined}
            onClick={() => onPick({ day, time })}
          >
            {formatClock(time)}
          </button>
        ))}
      </div>
    </div>
  );
}
