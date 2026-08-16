import { calculateChartStats } from '@/lib/chart-stats';
import { TANK_COLORS } from '@/lib/utils';
import type {
  ChartDataset,
  ChartObject,
  ChartPoint,
  ChartTestStats,
  ChartValuePoint,
  OverlayPeriod
} from '@/lib/types';

export type PeriodPresetKind = 'year' | 'quarter' | 'month';

const QUARTER_LABELS: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV'
};

/**
 * Builds ready-made period presets (whole years / quarters / months) that
 * are actually present in `dates`. The caller can still add arbitrary
 * custom ranges on top via `buildCustomPeriod`.
 */
export function buildPeriodPresets(dates: readonly string[], kind: PeriodPresetKind): OverlayPeriod[] {
  const uniqueDates = Array.from(new Set(dates)).filter(isIsoDate).sort();
  if (uniqueDates.length === 0) {
    return [];
  }

  if (kind === 'year') {
    const years = Array.from(new Set(uniqueDates.map((date) => date.slice(0, 4)))).sort();
    return years.map((year) => ({
      id: `year-${year}`,
      label: year,
      from: `${year}-01-01`,
      to: `${year}-12-31`
    }));
  }

  if (kind === 'quarter') {
    const quarterKeys = new Set<string>();
    for (const date of uniqueDates) {
      const year = date.slice(0, 4);
      const month = Number(date.slice(5, 7));
      const quarter = Math.floor((month - 1) / 3) + 1;
      quarterKeys.add(`${year}-${quarter}`);
    }
    return Array.from(quarterKeys)
      .sort()
      .map((key) => {
        const [year, quarterRaw] = key.split('-');
        const quarter = Number(quarterRaw);
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        return {
          id: `quarter-${key}`,
          label: `${QUARTER_LABELS[quarter]} кв. ${year}`,
          from: `${year}-${pad2(startMonth)}-01`,
          to: `${year}-${pad2(endMonth)}-${pad2(lastDayOfMonth(Number(year), endMonth))}`
        };
      });
  }

  const monthKeys = new Set(uniqueDates.map((date) => date.slice(0, 7)));
  return Array.from(monthKeys)
    .sort()
    .map((key) => {
      const [yearRaw, monthRaw] = key.split('-');
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      return {
        id: `month-${key}`,
        label: `${pad2(month)}.${year}`,
        from: `${key}-01`,
        to: `${key}-${pad2(lastDayOfMonth(year, month))}`
      };
    });
}

/** Builds a single arbitrary-range period from user-picked `from`/`to` dates. */
export function buildCustomPeriod(from: string, to: string, label?: string): OverlayPeriod {
  const id = `custom-${from}_${to}`;
  return {
    id,
    label: label && label.trim().length > 0 ? label.trim() : `${formatShortDate(from)} — ${formatShortDate(to)}`,
    from,
    to
  };
}

/**
 * Stamps each period with a display color from the shared palette, in
 * period order. Matches the chart's own per-line color exactly when the
 * dataset has a single technological object (the common case for
 * retrospective single-site files) — with several real objects the chart
 * interleaves object×period combinations, so swatches shown ahead of
 * rendering are only an approximation in that case.
 */
export function assignPeriodColors(periods: readonly OverlayPeriod[]): OverlayPeriod[] {
  return periods.map((period, index) => ({
    ...period,
    color: TANK_COLORS[index % TANK_COLORS.length]
  }));
}

export function buildOverlayObjectKey(objectKey: string, periodId: string): string {
  return `${objectKey}::${periodId}`;
}

/**
 * Builds one efficiency group per period (see StatsSummary's
 * `EfficiencyGroup` — kept structurally compatible here rather than
 * imported, to avoid a circular import) so input->output efficiency is
 * computed within each period instead of being averaged across all of
 * them, which would be meaningless (e.g. averaging 2023 against 2025).
 */
export function buildPeriodEfficiencyGroups(
  realObjectKeys: readonly string[],
  periods: readonly OverlayPeriod[]
): Array<{ key: string; label: string; objectKeys: string[] }> {
  return periods.map((period) => ({
    key: period.id,
    label: period.label,
    objectKeys: realObjectKeys.map((objectKey) => buildOverlayObjectKey(objectKey, period.id))
  }));
}

export interface OverlayPhase {
  /** Also used verbatim as the overlaid ChartPoint's `date` field. */
  phaseKey: string;
  /** 1-based ordinal position within each period. */
  index: number;
  /** Real calendar date each period contributed at this phase, keyed by period id. */
  periodDates: Record<string, string>;
}

export interface PeriodOverlayResult {
  dataset: ChartDataset;
  phases: OverlayPhase[];
}

/**
 * Transforms a `ChartDataset` with a plain date axis into one overlaying
 * several periods of the same parameter, so the existing chart/statistics/
 * trendline/efficiency machinery (which only ever sees `objects`) renders
 * it unchanged. Each (technological object × period) pair becomes its own
 * pseudo-object; points are aligned by ordinal position within their
 * period (agreed with the customer over calendar alignment, since periods
 * being compared can differ in length — a quarter vs a year — or be
 * partial, like 2026 having only 3 months of data so far).
 */
export function buildPeriodOverlayDataset(
  dataset: ChartDataset,
  periods: readonly OverlayPeriod[]
): PeriodOverlayResult {
  if (periods.length === 0 || dataset.objects.length === 0) {
    return {
      dataset: { tests: dataset.tests, objects: [], points: [], statsByTest: [] },
      phases: []
    };
  }

  const pointsByPeriod = periods.map((period) => ({
    period,
    points: dataset.points
      .filter((point) => point.date >= period.from && point.date <= period.to)
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date))
  }));

  const phaseCount = pointsByPeriod.reduce((max, entry) => Math.max(max, entry.points.length), 0);

  const objects: ChartObject[] = [];
  let orderCounter = 1;
  for (const object of dataset.objects) {
    for (const { period } of pointsByPeriod) {
      objects.push({
        objectKey: buildOverlayObjectKey(object.objectKey, period.id),
        objectLabel: dataset.objects.length > 1 ? `${object.objectLabel} · ${period.label}` : period.label,
        objectOrder: orderCounter,
        objectActive: object.objectActive
      });
      orderCounter += 1;
    }
  }

  const phases: OverlayPhase[] = [];
  const points: ChartPoint[] = [];
  const statsAccumulator = new Map<number, number[]>();

  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const phaseKey = String(phaseIndex + 1);
    const periodDates: Record<string, string> = {};
    const values: ChartValuePoint[] = [];

    for (const { period, points: periodPoints } of pointsByPeriod) {
      const sourcePoint = periodPoints[phaseIndex];
      if (sourcePoint) {
        periodDates[period.id] = sourcePoint.date;
      }

      // A shorter period (e.g. 2026 with only 3 months so far) has no
      // source point past its own length — still emit explicit `null`
      // entries for every (test × object) here rather than omitting the
      // pseudo-object entirely, so this doesn't depend on every downstream
      // consumer defensively falling back to `?? null` on a missing key.
      const valueByTestObject = sourcePoint
        ? new Map(sourcePoint.values.map((item) => [`${item.testId}::${item.objectKey}`, item.value] as const))
        : null;

      for (const test of dataset.tests) {
        for (const object of dataset.objects) {
          const value = valueByTestObject?.get(`${test.testId}::${object.objectKey}`) ?? null;
          values.push({
            testId: test.testId,
            objectKey: buildOverlayObjectKey(object.objectKey, period.id),
            value
          });

          if (value !== null) {
            const bucket = statsAccumulator.get(test.testId);
            if (bucket) {
              bucket.push(value);
            } else {
              statsAccumulator.set(test.testId, [value]);
            }
          }
        }
      }
    }

    phases.push({ phaseKey, index: phaseIndex + 1, periodDates });
    points.push({ date: phaseKey, values, averages: [] });
  }

  const statsByTest: ChartTestStats[] = dataset.tests.map((test) => ({
    testId: test.testId,
    testName: test.testName,
    stats: calculateChartStats(statsAccumulator.get(test.testId) ?? [])
  }));

  return {
    dataset: { tests: dataset.tests, objects, points, statsByTest },
    phases
  };
}

/** Formats an overlaid `ChartPoint.date` phase key ("3") as "Месяц 3" / "День 3". */
export function formatPhaseLabel(phaseKey: string, unit: 'day' | 'month' = 'month'): string {
  const index = Number(phaseKey);
  if (!Number.isFinite(index)) {
    return phaseKey;
  }
  return unit === 'day' ? `День ${index}` : `Месяц ${index}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function formatShortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}
