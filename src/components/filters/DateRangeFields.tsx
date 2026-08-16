'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DayPicker } from 'react-day-picker';
import { addMonths, format, isValid, parse, parseISO, startOfDay, subMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import type { DateRange } from '@/lib/types';
import { fromIsoDate } from '@/lib/utils';

interface DateRangeFieldsProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  availableDates: string[];
  /**
   * Buttons rendered in the same row, to the right of the two fields.
   * `draft` is what the fields currently read (typed text if it parses,
   * otherwise `value`), so the caller can act on a range the user has typed
   * but not yet committed — that is how both "Применить" and "Добавить
   * период" work off the same two inputs.
   */
  actions?: (helpers: { draft: DateRange }) => ReactNode;
}

/**
 * The bare "from / to" pair with calendars — no heading, no presets. Split
 * out of the period control so a draft range can be collected anywhere
 * (e.g. for a custom comparison period) without dragging along a second
 * copy of the whole period panel.
 */
export function DateRangeFields({ value, onChange, availableDates, actions }: DateRangeFieldsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [manualFrom, setManualFrom] = useState(value.from ? format(parseISO(value.from), 'dd.MM.yyyy') : '');
  const [manualTo, setManualTo] = useState(value.to ? format(parseISO(value.to), 'dd.MM.yyyy') : '');
  const [activeCalendar, setActiveCalendar] = useState<'from' | 'to' | null>(null);
  const [fromMonth, setFromMonth] = useState(fromIsoDate(value.from) ?? startOfDay(new Date()));
  const [toMonth, setToMonth] = useState(fromIsoDate(value.to) ?? startOfDay(new Date()));

  useEffect(() => {
    setManualFrom(value.from ? format(parseISO(value.from), 'dd.MM.yyyy') : '');
    setManualTo(value.to ? format(parseISO(value.to), 'dd.MM.yyyy') : '');
  }, [value.from, value.to]);

  useEffect(() => {
    if (!activeCalendar) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setActiveCalendar(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeCalendar]);

  const sortedDates = useMemo(
    () =>
      [...availableDates]
        .map((date) => parseISO(date))
        .filter((date) => isValid(date))
        .sort((a, b) => a.getTime() - b.getTime()),
    [availableDates]
  );

  const draft = useMemo<DateRange>(() => {
    const fromDate = parse(manualFrom, 'dd.MM.yyyy', new Date());
    const toDate = parse(manualTo, 'dd.MM.yyyy', new Date());
    const from = isValid(fromDate) ? format(fromDate, 'yyyy-MM-dd') : null;
    const to = isValid(toDate) ? format(toDate, 'yyyy-MM-dd') : null;

    if (from && to && from > to) {
      return { from: to, to: from };
    }
    return { from, to };
  }, [manualFrom, manualTo]);

  function setFromDate(date: Date | undefined) {
    const from = date ? format(date, 'yyyy-MM-dd') : null;
    if (from && value.to && from > value.to) {
      onChange({ from, to: from });
      return;
    }
    onChange({ from, to: value.to });
  }

  function setToDate(date: Date | undefined) {
    const to = date ? format(date, 'yyyy-MM-dd') : null;
    if (to && value.from && to < value.from) {
      onChange({ from: to, to });
      return;
    }
    onChange({ from: value.from, to });
  }

  return (
    <div ref={rootRef} className="relative grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
      <div className="relative">
        <div className="flex h-9 border border-ink/30">
          <input
            value={manualFrom}
            onChange={(event) => setManualFrom(event.target.value)}
            placeholder="Начало (DD.MM.YYYY)"
            className="h-full w-full border-none px-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setActiveCalendar((current) => (current === 'from' ? null : 'from'))}
            className="flex w-10 items-center justify-center border-l border-ink/30 hover:bg-ink/5"
            aria-label="Открыть календарь начала"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>

        {activeCalendar === 'from' && (
          <div className="absolute left-0 top-[40px] z-30 w-[256px] border border-ink/25 bg-white p-1.5">
            <CalendarHeader
              month={fromMonth}
              onPrev={() => setFromMonth((prev) => subMonths(prev, 1))}
              onNext={() => setFromMonth((prev) => addMonths(prev, 1))}
            />
            <DayPicker
              className="formal-daypicker"
              mode="single"
              month={fromMonth}
              onMonthChange={setFromMonth}
              hideNavigation
              selected={fromIsoDate(value.from)}
              onSelect={(date) => {
                setFromDate(date);
                setActiveCalendar(null);
              }}
              modifiers={{ hasData: sortedDates }}
              modifiersClassNames={{ hasData: 'rdp-has-data' }}
            />
          </div>
        )}
      </div>

      <div className="relative">
        <div className="flex h-9 border border-ink/30">
          <input
            value={manualTo}
            onChange={(event) => setManualTo(event.target.value)}
            placeholder="Конец (DD.MM.YYYY)"
            className="h-full w-full border-none px-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setActiveCalendar((current) => (current === 'to' ? null : 'to'))}
            className="flex w-10 items-center justify-center border-l border-ink/30 hover:bg-ink/5"
            aria-label="Открыть календарь конца"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>

        {activeCalendar === 'to' && (
          <div className="absolute right-0 top-[40px] z-30 w-[256px] border border-ink/25 bg-white p-1.5">
            <CalendarHeader
              month={toMonth}
              onPrev={() => setToMonth((prev) => subMonths(prev, 1))}
              onNext={() => setToMonth((prev) => addMonths(prev, 1))}
            />
            <DayPicker
              className="formal-daypicker"
              mode="single"
              month={toMonth}
              onMonthChange={setToMonth}
              hideNavigation
              selected={fromIsoDate(value.to)}
              onSelect={(date) => {
                setToDate(date);
                setActiveCalendar(null);
              }}
              modifiers={{ hasData: sortedDates }}
              modifiersClassNames={{ hasData: 'rdp-has-data' }}
            />
          </div>
        )}
      </div>

      {actions?.({ draft })}
    </div>
  );
}

function CalendarHeader({ month, onPrev, onNext }: { month: Date; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between border border-ink/20 px-1.5 py-1">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-6 w-6 items-center justify-center border border-transparent hover:border-ink/25"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink">{format(month, 'LLLL yyyy')}</span>
      <button
        type="button"
        onClick={onNext}
        className="flex h-6 w-6 items-center justify-center border border-transparent hover:border-ink/25"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
