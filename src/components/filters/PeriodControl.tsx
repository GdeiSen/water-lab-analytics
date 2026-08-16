'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { format, parseISO, startOfDay, subDays, subMonths, subYears } from 'date-fns';

import { DateRangeFields } from '@/components/filters/DateRangeFields';
import { Button } from '@/components/ui/Button';
import {
  assignPeriodColors,
  buildCustomPeriod,
  buildPeriodPresets,
  type PeriodPresetKind
} from '@/lib/period-overlay';
import type { DateRange, OverlayPeriod } from '@/lib/types';

interface PeriodControlProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  availableDates: string[];
  /**
   * All four omitted together turns off comparison mode entirely: no mode
   * switcher renders, and the control is just the single-range picker.
   * Daily mode uses this — a period only means "when", and there is no
   * archive-wide notion of comparable slices the way retro's month grid
   * has one.
   */
  periods?: OverlayPeriod[];
  onPeriodsChange?: (periods: OverlayPeriod[]) => void;
  overlayEnabled?: boolean;
  onOverlayEnabledChange?: (enabled: boolean) => void;
}

const RELATIVE_PRESETS = [
  { key: '7d', label: 'Последние 7 дней' },
  { key: 'month', label: 'Последний месяц' },
  { key: 'quarter', label: 'Последний квартал' },
  { key: 'year', label: 'Последний год' },
  { key: 'all', label: 'Весь период' }
] as const;

const OVERLAY_PRESET_TABS: Array<{ key: PeriodPresetKind; label: string }> = [
  { key: 'year', label: 'По годам' },
  { key: 'quarter', label: 'По кварталам' },
  { key: 'month', label: 'По месяцам' }
];

/**
 * The one place a time span is chosen, in up to two modes over the same two
 * date fields:
 *
 * - "Один период" narrows the query to a single range (`value`), which is
 *   what actually gets sent to the backend. Always available.
 * - "Сравнение периодов" overlays several slices of the same parameter on
 *   one chart (2023 vs 2024 vs Q1 2023, ...), each drawn as its own colored
 *   line — see src/lib/period-overlay.ts, where a period becomes a
 *   pseudo-object the existing chart already knows how to draw. Only
 *   offered when the `periods`/`overlayEnabled` props are passed; retro
 *   mode passes them, daily mode does not (see the prop doc comments).
 *
 * Comparison slices whatever the query returned rather than re-querying, so
 * switching into it clears the single range: a chart still narrowed to, say,
 * the last year cannot show a 2023-vs-2024 comparison, and the preset chips
 * (built from the loaded points) would not even offer the missing years.
 */
export function PeriodControl({
  value,
  onChange,
  availableDates,
  periods,
  onPeriodsChange,
  overlayEnabled,
  onOverlayEnabledChange
}: PeriodControlProps) {
  const [presetKind, setPresetKind] = useState<PeriodPresetKind>('year');
  const [draftRange, setDraftRange] = useState<DateRange>({ from: null, to: null });
  // Bumped after a period is added so the two fields remount empty: their
  // text is only pushed outward on commit, so clearing `draftRange` alone
  // would leave the just-used dates sitting in the inputs.
  const [draftFieldsKey, setDraftFieldsKey] = useState(0);

  const comparisonAvailable = Boolean(onPeriodsChange && onOverlayEnabledChange);
  const activePeriods = useMemo(() => periods ?? [], [periods]);
  const comparisonMode = comparisonAvailable && (overlayEnabled ?? false);

  const sortedDates = useMemo(() => [...availableDates].sort(), [availableDates]);
  const presetOptions = useMemo(
    () => buildPeriodPresets(availableDates, presetKind),
    [availableDates, presetKind]
  );
  const selectedIds = useMemo(
    () => new Set(activePeriods.map((period) => period.id)),
    [activePeriods]
  );

  function applyRelativePreset(preset: (typeof RELATIVE_PRESETS)[number]['key']) {
    const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
    const last = sortedDates[sortedDates.length - 1] ?? today;

    if (preset === 'all') {
      onChange({ from: sortedDates[0] ?? null, to: sortedDates.length > 0 ? last : null });
      return;
    }

    const to = parseISO(last);
    const from =
      preset === '7d'
        ? subDays(to, 6)
        : preset === 'month'
          ? subMonths(to, 1)
          : preset === 'quarter'
            ? subMonths(to, 3)
            : subYears(to, 1);

    onChange({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') });
  }

  function setMode(nextComparisonMode: boolean) {
    if (!onOverlayEnabledChange || nextComparisonMode === comparisonMode) {
      return;
    }
    onOverlayEnabledChange(nextComparisonMode);
    if (nextComparisonMode) {
      // See the note above: comparison needs the whole loaded series.
      onChange({ from: null, to: null });
    }
  }

  function togglePreset(preset: OverlayPeriod) {
    if (selectedIds.has(preset.id)) {
      onPeriodsChange?.(assignPeriodColors(activePeriods.filter((period) => period.id !== preset.id)));
      return;
    }
    onPeriodsChange?.(assignPeriodColors([...activePeriods, preset]));
  }

  function addCustomPeriod(range: DateRange) {
    if (!range.from || !range.to) {
      return;
    }
    const custom = buildCustomPeriod(range.from, range.to);
    if (!selectedIds.has(custom.id)) {
      onPeriodsChange?.(assignPeriodColors([...activePeriods, custom]));
    }
    setDraftRange({ from: null, to: null });
    setDraftFieldsKey((current) => current + 1);
  }

  function removePeriod(id: string) {
    onPeriodsChange?.(assignPeriodColors(activePeriods.filter((period) => period.id !== id)));
  }

  return (
    <div className="space-y-2 border border-ink/20 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">Период</p>
        {comparisonAvailable && (
          <div className="flex border border-ink/20">
            <ModeTab active={!comparisonMode} onClick={() => setMode(false)}>
              Один период
            </ModeTab>
            <ModeTab active={comparisonMode} onClick={() => setMode(true)}>
              Сравнение периодов
            </ModeTab>
          </div>
        )}
      </div>

      {comparisonMode ? (
        <>
          <p className="text-[11px] leading-snug text-ink/50">
            Выберите несколько периодов одного показателя — каждый будет показан своей линией на
            одном графике.
          </p>

          <div className="flex border border-ink/20">
            {OVERLAY_PRESET_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={clsx(
                  'h-8 flex-1 border-r border-ink/20 text-xs last:border-r-0',
                  presetKind === tab.key ? 'bg-ink text-white' : 'hover:bg-ink/5'
                )}
                onClick={() => setPresetKind(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {presetOptions.length === 0 ? (
            <p className="text-[11px] text-ink/40">Нет доступных дат для этого разбиения.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {presetOptions.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(preset)}
                  className={clsx(
                    'border px-2 py-1 text-xs transition',
                    selectedIds.has(preset.id)
                      ? 'border-ink bg-ink text-white'
                      : 'border-ink/25 bg-white text-ink/70 hover:bg-ink/5'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <DateRangeFields
            key={draftFieldsKey}
            value={draftRange}
            onChange={setDraftRange}
            availableDates={availableDates}
            actions={({ draft }) => (
              <Button
                variant="secondary"
                onClick={() => addCustomPeriod(draft)}
                disabled={!draft.from || !draft.to}
                className="md:col-span-2"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Добавить период
                </span>
              </Button>
            )}
          />

          {activePeriods.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {activePeriods.map((period) => (
                <li
                  key={period.id}
                  className="flex items-center gap-1.5 border border-ink/15 bg-[#f7f8fa] px-2 py-1 text-xs"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: period.color ?? '#6b7280' }}
                  />
                  <span className="truncate">{period.label}</span>
                  <button
                    type="button"
                    onClick={() => removePeriod(period.id)}
                    className="shrink-0 text-ink/40 transition hover:text-ember"
                    title="Убрать период"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <DateRangeFields
            value={value}
            onChange={onChange}
            availableDates={availableDates}
            actions={({ draft }) => (
              <>
                <Button variant="secondary" onClick={() => onChange(draft)}>
                  Применить
                </Button>
                <Button variant="secondary" onClick={() => onChange({ from: null, to: null })}>
                  Сброс
                </Button>
              </>
            )}
          />

          <div className="flex flex-wrap gap-1">
            {RELATIVE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyRelativePreset(preset.key)}
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
        </>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'h-7 border-r border-ink/20 px-2.5 text-xs last:border-r-0',
        active ? 'bg-ink text-white' : 'hover:bg-ink/5'
      )}
    >
      {children}
    </button>
  );
}
