'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import {
  addMonths,
  format,
  isValid,
  parse,
  parseISO,
  startOfDay,
  subDays,
  subMonths,
  subYears
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { DateRange } from '@/lib/types';
import { fromIsoDate } from '@/lib/utils';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  availableDates: string[];
}

const PRESETS = [
  { key: '7d', label: 'Последние 7 дней' },
  { key: 'month', label: 'Последний месяц' },
  { key: 'quarter', label: 'Последний квартал' },
  { key: 'year', label: 'Последний год' },
  { key: 'all', label: 'Весь период' }
] as const;

type CalendarTarget = 'from' | 'to' | null;

export function DateRangePicker({
  value,
  onChange,
  availableDates
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [manualFrom, setManualFrom] = useState(value.from ? format(parseISO(value.from), 'dd.MM.yyyy') : '');
  const [manualTo, setManualTo] = useState(value.to ? format(parseISO(value.to), 'dd.MM.yyyy') : '');
  const [activeCalendar, setActiveCalendar] = useState<CalendarTarget>(null);
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

  function setFromDate(date: Date | undefined) {
    const from = date ? format(date, 'yyyy-MM-dd') : null;
    const currentTo = value.to;

    if (from && currentTo && from > currentTo) {
      onChange({ from, to: from });
      return;
    }

    onChange({ from, to: currentTo });
  }

  function setToDate(date: Date | undefined) {
    const to = date ? format(date, 'yyyy-MM-dd') : null;
    const currentFrom = value.from;

    if (to && currentFrom && to < currentFrom) {
      onChange({ from: to, to });
      return;
    }

    onChange({ from: currentFrom, to });
  }

  function applyPreset(preset: (typeof PRESETS)[number]['key']) {
    const today = startOfDay(new Date());
    const maxAvailable = sortedDates[sortedDates.length - 1] ?? today;

    if (preset === 'all') {
      onChange({
        from: sortedDates[0] ? format(sortedDates[0], 'yyyy-MM-dd') : null,
        to: sortedDates.length ? format(maxAvailable, 'yyyy-MM-dd') : null
      });
      return;
    }

    const to = maxAvailable;
    const from =
      preset === '7d'
        ? subDays(to, 6)
        : preset === 'month'
          ? subMonths(to, 1)
          : preset === 'quarter'
            ? subMonths(to, 3)
            : subYears(to, 1);

    onChange({
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd')
    });
  }

  function applyManual() {
    const fromDate = parse(manualFrom, 'dd.MM.yyyy', new Date());
    const toDate = parse(manualTo, 'dd.MM.yyyy', new Date());

    const nextFrom = isValid(fromDate) ? format(fromDate, 'yyyy-MM-dd') : null;
    const nextTo = isValid(toDate) ? format(toDate, 'yyyy-MM-dd') : null;

    if (nextFrom && nextTo && nextFrom > nextTo) {
      onChange({ from: nextTo, to: nextFrom });
      return;
    }

    onChange({ from: nextFrom, to: nextTo });
  }

  return (
    <div ref={rootRef} className="relative space-y-2 border border-ink/20 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">Период</p>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
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

        <Button variant="secondary" onClick={applyManual}>
          Применить
        </Button>
        <Button variant="secondary" onClick={() => onChange({ from: null, to: null })}>
          Сброс
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset.key)}
            className="border border-ink/30 px-2 py-1 text-xs text-ink/80 hover:bg-ink/5"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {value.from && value.to && (
        <p className="text-xs text-ink/70">
          Активный диапазон: {format(parseISO(value.from), 'dd.MM.yyyy')} -{' '}
          {format(parseISO(value.to), 'dd.MM.yyyy')}
        </p>
      )}
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
