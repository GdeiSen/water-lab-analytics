'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Maximize2, Minimize2, Search } from 'lucide-react';

import type {
  ChartDataset,
  ChartGuideMode,
  ChartHoverSnapshot,
  ChartTestStats,
  ChartTrendlineReport,
  ChartTrendlineSettings,
  ParameterLink
} from '@/lib/types';
import { formatDate, formatNumber } from '@/lib/utils';
import { TANK_COLORS } from '@/lib/utils';

interface StatsSummaryProps {
  data: ChartDataset | null;
  hoverSnapshot: ChartHoverSnapshot | null;
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  parameterLinks: ParameterLink[];
  guideMode: ChartGuideMode;
  trendlineReports: ChartTrendlineReport[];
  trendlineSettings: ChartTrendlineSettings;
  onExportExcel: () => void;
}

interface TableColumn {
  key: string;
  testId: number;
  objectKey: string;
}

interface TableRow {
  date: string;
  values: Record<string, number | null>;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: 'date' | string;
  direction: SortDirection;
}

interface PearsonCorrelationEntry {
  key: string;
  label: string;
  coefficient: number | null;
  pairsUsed: number;
  warning: string | null;
}

interface PearsonCorrelationTest {
  testId: number;
  testName: string;
}

export function StatsSummary({
  data,
  hoverSnapshot,
  selectedTestIds,
  selectedObjectKeys,
  parameterLinks,
  guideMode,
  trendlineReports,
  trendlineSettings,
  onExportExcel
}: StatsSummaryProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [dateQuery, setDateQuery] = useState('');
  const [sortState, setSortState] = useState<SortState>({ key: 'date', direction: 'asc' });

  const visibleTests = useMemo(() => {
    if (!data || data.tests.length === 0) {
      return [];
    }
    if (selectedTestIds.length === 0) {
      return data.tests;
    }
    const selected = new Set(selectedTestIds);
    return data.tests.filter((test) => selected.has(test.testId));
  }, [data, selectedTestIds]);

  const visibleObjects = useMemo(() => {
    if (!data || data.objects.length === 0) {
      return [];
    }
    if (selectedObjectKeys.length === 0) {
      return data.objects;
    }
    const selected = new Set(selectedObjectKeys);
    return data.objects.filter((object) => selected.has(object.objectKey));
  }, [data, selectedObjectKeys]);

  const statsEntries = useMemo(() => {
    if (!data) {
      return [];
    }
    const selected = new Set(visibleTests.map((test) => test.testId));
    return data.statsByTest.filter((entry) => selected.has(entry.testId));
  }, [data, visibleTests]);

  const testColorById = useMemo(() => {
    const map = new Map<number, string>();
    visibleTests.forEach((test, index) => {
      map.set(test.testId, TANK_COLORS[index % TANK_COLORS.length]);
    });
    return map;
  }, [visibleTests]);

  const tableColumns = useMemo(() => {
    const columns: TableColumn[] = [];
    for (const test of visibleTests) {
      for (const object of visibleObjects) {
        columns.push({
          key: `${test.testId}__${object.objectKey}`,
          testId: test.testId,
          objectKey: object.objectKey
        });
      }
    }
    return columns;
  }, [visibleObjects, visibleTests]);

  const tableRows = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.points.map((point) => {
      const pointValueMap = new Map<string, number | null>(
        point.values.map((item) => [`${item.testId}__${item.objectKey}`, item.value] as const)
      );
      const values: Record<string, number | null> = {};
      for (const column of tableColumns) {
        values[column.key] = pointValueMap.get(column.key) ?? null;
      }

      return {
        date: point.date,
        values
      } satisfies TableRow;
    });
  }, [data, tableColumns]);

  const filteredRows = useMemo(() => {
    const query = dateQuery.trim().toLowerCase();
    if (!query) {
      return tableRows;
    }

    return tableRows.filter((row) => {
      const iso = row.date.toLowerCase();
      const display = formatDate(row.date).toLowerCase();
      return iso.includes(query) || display.includes(query);
    });
  }, [dateQuery, tableRows]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];

    rows.sort((left, right) => {
      if (sortState.key === 'date') {
        const result = left.date.localeCompare(right.date);
        return sortState.direction === 'asc' ? result : -result;
      }

      const leftValue = left.values[sortState.key] ?? null;
      const rightValue = right.values[sortState.key] ?? null;

      if (leftValue === null && rightValue === null) {
        return 0;
      }
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }

      const result = leftValue - rightValue;
      return sortState.direction === 'asc' ? result : -result;
    });

    return rows;
  }, [filteredRows, sortState]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const element = panelRef.current;
      setIsFullscreen(Boolean(element && document.fullscreenElement === element));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPseudoFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPseudoFullscreen]);

  const activeDate = hoverSnapshot?.date ?? null;
  const isExpanded = isFullscreen || isPseudoFullscreen;

  const trendReportByTestId = useMemo(() => {
    const map = new Map<number, ChartTrendlineReport>();
    for (const report of trendlineReports) {
      if (report.testId !== null && !map.has(report.testId)) {
        map.set(report.testId, report);
      }
    }
    return map;
  }, [trendlineReports]);

  const statGroups = useMemo(
    () =>
      buildStatGroups(
        statsEntries,
        parameterLinks,
        selectedTestIds,
        selectedObjectKeys,
        guideMode,
        data,
        hoverSnapshot
      ),
    [data, guideMode, hoverSnapshot, parameterLinks, selectedObjectKeys, selectedTestIds, statsEntries]
  );

  const toggleSort = (key: 'date' | string) => {
    setSortState((current) => {
      if (current.key !== key) {
        return { key, direction: 'asc' };
      }
      return {
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc'
      };
    });
  };

  const getSortMark = (key: 'date' | string): string => {
    if (sortState.key !== key) {
      return '\u21C5';
    }
    return sortState.direction === 'asc' ? '\u2191' : '\u2193';
  };

  const toggleFullscreen = async () => {
    const element = panelRef.current;
    if (!element) {
      return;
    }

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }
      await element.requestFullscreen();
    } catch {
      setIsPseudoFullscreen(true);
    }
  };

  if (!data || data.tests.length === 0) {
    return (
      <div className="border border-dashed border-ink/30 bg-white p-4 text-sm text-ink/60">
        {'\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u0432\u044b\u0431\u043e\u0440\u0430 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u043e\u0432 \u0438 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430 \u0434\u0430\u0442.'}
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-ink/20 bg-white p-3">
      <div className="grid gap-2 md:grid-cols-2">
        {statGroups.map((group) => {
          if (group.kind === 'linked') {
            const groupPearson = buildPearsonCorrelationEntries(data, group.entries, visibleObjects);
            return (
              <div key={`linked-${group.link.id}`} className="md:col-span-2">
                <div className="border border-ink/20 bg-white p-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.entries.map((entry) => (
                      <StatsCard
                        key={entry.testId}
                        entry={entry}
                        color={testColorById.get(entry.testId) ?? TANK_COLORS[0]}
                        hoverValue={getHoverCursorValue(hoverSnapshot, entry.testId, guideMode)}
                        trendReport={trendReportByTestId.get(entry.testId) ?? null}
                        trendlineSettings={trendlineSettings}
                      />
                    ))}
                  </div>
                  <GroupedMetricRows
                    pearsonEntries={groupPearson}
                    efficiencyAverage={group.averageEfficiency}
                    efficiencyCursor={group.cursorEfficiency}
                  />
                </div>
              </div>
            );
          }

          if (group.kind === 'paired') {
            const groupPearson = buildPearsonCorrelationEntries(data, group.entries, visibleObjects);
            return (
              <div key={`paired-${group.entries.map((entry) => entry.testId).join('-')}`} className="md:col-span-2">
                <div className="border border-ink/20 bg-white p-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.entries.map((entry) => (
                      <StatsCard
                        key={entry.testId}
                        entry={entry}
                        color={testColorById.get(entry.testId) ?? TANK_COLORS[0]}
                        hoverValue={getHoverCursorValue(hoverSnapshot, entry.testId, guideMode)}
                        trendReport={trendReportByTestId.get(entry.testId) ?? null}
                        trendlineSettings={trendlineSettings}
                      />
                    ))}
                  </div>
                  <GroupedMetricRows pearsonEntries={groupPearson} />
                </div>
              </div>
            );
          }

          const entry = group.entry;
          const color = testColorById.get(entry.testId) ?? TANK_COLORS[0];
          return (
            <StatsCard
              key={entry.testId}
              entry={entry}
              color={color}
              hoverValue={getHoverCursorValue(hoverSnapshot, entry.testId, guideMode)}
              trendReport={trendReportByTestId.get(entry.testId) ?? null}
              trendlineSettings={trendlineSettings}
            />
          );
        })}
      </div>

      <div
        ref={panelRef}
        className={`border border-ink/15 bg-white p-2 ${isExpanded ? 'fixed inset-3 z-[110] p-3 shadow-2xl' : ''}`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">
            {'\u0422\u0430\u0431\u043b\u0438\u0447\u043d\u043e\u0435 \u043f\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportExcel}
              className="flex h-8 w-8 items-center justify-center rounded border border-ink/25 text-ink/70 transition hover:bg-ink/5 hover:text-ink"
              title="Экспортировать таблицу в Excel"
            >
              <FileDown className="h-4 w-4" />
            </button>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45" />
              <input
                type="text"
                value={dateQuery}
                onChange={(event) => setDateQuery(event.target.value)}
                placeholder={'\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0434\u0430\u0442\u0435'}
                className="h-8 w-48 border border-ink/25 bg-white pl-7 pr-2 text-xs text-ink outline-none transition focus:border-ink/45"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void toggleFullscreen();
              }}
              className="flex h-8 w-8 items-center justify-center rounded border border-ink/25 text-ink/70 transition hover:bg-ink/5 hover:text-ink"
              title={isExpanded ? '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0442\u0430\u0431\u043b\u0438\u0446\u0443' : '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0442\u0430\u0431\u043b\u0438\u0446\u0443'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className={`overflow-auto ${isExpanded ? 'h-[calc(100vh-124px)]' : 'max-h-[340px]'}`}>
          {tableColumns.length === 0 || tableRows.length === 0 ? (
            <div className="p-3 text-xs text-ink/60">{'\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0434\u043b\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u044b.'}</div>
          ) : (
            <table className="min-w-max border-collapse text-xs">
              <thead>
                <tr>
                  <th rowSpan={2} className="min-w-[96px] border border-ink/15 bg-[#e9edf2] px-2 py-1.5 text-left font-semibold text-ink/80">
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="flex w-full items-center justify-between gap-1"
                    >
                      <span>{'\u0414\u0430\u0442\u0430'}</span>
                      <span className="text-[11px] text-ink/60">{getSortMark('date')}</span>
                    </button>
                  </th>
                  {visibleTests.map((test) => (
                    <th
                      key={`group-${test.testId}`}
                      colSpan={visibleObjects.length}
                      className="border border-ink/15 bg-[#f2f4f7] px-2 py-1.5 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-[3px] w-5 rounded-sm"
                          style={{ backgroundColor: testColorById.get(test.testId) ?? '#0f766e' }}
                        />
                        <span
                          className="truncate text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: testColorById.get(test.testId) ?? '#0f766e' }}
                        >
                          {test.testName}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {visibleTests.flatMap((test) =>
                    visibleObjects.map((object) => {
                      const columnKey = `${test.testId}__${object.objectKey}`;
                      return (
                        <th
                          key={`header-${columnKey}`}
                          className="min-w-[112px] border border-ink/15 bg-[#f2f4f7] px-2 py-1.5 text-left font-semibold text-ink/75"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(columnKey)}
                            className="flex w-full items-center justify-between gap-1"
                          >
                            <span className="truncate">{object.objectLabel}</span>
                            <span className="text-[11px] text-ink/60">{getSortMark(columnKey)}</span>
                          </button>
                        </th>
                      );
                    })
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const isActive = activeDate === row.date;
                  return (
                    <tr key={`row-${row.date}`} className={isActive ? 'bg-[#fff4ce]' : 'hover:bg-ink/5'}>
                      <td
                        className={`min-w-[96px] border border-ink/15 px-2 py-1.5 font-semibold ${
                          isActive ? 'bg-[#ffe8a3]' : 'bg-white'
                        }`}
                      >
                        {formatDate(row.date)}
                      </td>
                      {tableColumns.map((column) => (
                        <td
                          key={`cell-${row.date}-${column.key}`}
                          className="min-w-[112px] border border-ink/15 px-2 py-1.5 font-mono text-right text-[11px] text-ink/85"
                        >
                          {formatNumber(row.values[column.key], 3)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  entry,
  color,
  hoverValue,
  trendReport,
  trendlineSettings
}: {
  entry: ChartTestStats;
  color: string;
  hoverValue: number | null;
  trendReport: ChartTrendlineReport | null;
  trendlineSettings: ChartTrendlineSettings;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyEquation = () => {
    if (trendReport?.equation) {
      void navigator.clipboard.writeText(trendReport.equation).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div className="border border-ink/15 bg-[#f7f8fa] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-ink/70">
          {entry.testName}
        </p>
        <div
          className="shrink-0 border bg-white px-2 py-0.5 text-xs font-semibold"
          style={{
            borderColor: color,
            color
          }}
        >
          {formatNumber(hoverValue)}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Stat title="Min" value={formatNumber(entry.stats.min)} />
        <Stat title="Max" value={formatNumber(entry.stats.max)} />
        <Stat title={'\u0421\u0440\u0435\u0434\u043d\u0435\u0435'} value={formatNumber(entry.stats.average)} />
        <Stat title={'\u041c\u0435\u0434\u0438\u0430\u043d\u0430'} value={formatNumber(entry.stats.median)} />
      </div>
      {trendReport && !trendReport.warning && trendlineSettings.showEquation && trendReport.equation && (
        <div className="mt-2 border-t border-ink/10 pt-1.5">
          <span className="text-[10px] uppercase tracking-wide text-ink/40">
            {formatMode(trendReport.mode)}
          </span>
          <p
            className="cursor-pointer text-xs text-ink/65 transition hover:text-ink"
            title={copied ? 'Скопировано' : 'Нажмите, чтобы скопировать формулу'}
            onClick={handleCopyEquation}
          >
            {trendReport.equation}
          </p>
          {trendlineSettings.showRSquared && trendReport.rSquared !== null && (
            <p className="text-xs text-ink/50">R²: {formatRSquared(trendReport.rSquared)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  title,
  value
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="border border-ink/15 bg-white p-1.5">
      <p className="text-[10px] uppercase tracking-wide text-ink/50">{title}</p>
      <p className="text-xs font-semibold text-ink">{value}</p>
    </div>
  );
}

function GroupedMetricRows({
  pearsonEntries,
  efficiencyAverage,
  efficiencyCursor
}: {
  pearsonEntries: PearsonCorrelationEntry[] | null;
  efficiencyAverage?: number | null;
  efficiencyCursor?: number | null;
}) {
  const hasEfficiency = efficiencyAverage !== undefined || efficiencyCursor !== undefined;
  const hasRows = (pearsonEntries && pearsonEntries.length > 0) || hasEfficiency;

  if (!hasRows) {
    return null;
  }

  return (
    <div className="mt-2 divide-y divide-ink/10 border-t border-ink/15 text-xs">
      {pearsonEntries?.map((entry) => (
        <div key={`pearson-${entry.key}`} className="grid gap-2 py-1.5 md:grid-cols-[160px_1fr_120px]">
          <span className="font-semibold uppercase tracking-wide text-ink/55">Пирсон</span>
          <span className="min-w-0 truncate text-ink/70">
            {entry.label}
            <span className="ml-2 text-ink/40">точек: {entry.pairsUsed}</span>
            <span className="ml-2 text-ink/45">{entry.warning ?? describeCorrelation(entry.coefficient)}</span>
          </span>
          <span className="font-mono font-semibold text-right" style={{ color: getCorrelationColor(entry.coefficient) }}>
            r = {formatCorrelation(entry.coefficient)}
          </span>
        </div>
      ))}
      {hasEfficiency && (
        <div className="grid gap-2 py-1.5 md:grid-cols-[160px_1fr_120px]">
          <span className="font-semibold uppercase tracking-wide text-ink/55">Эффективность</span>
          <span className="min-w-0 truncate text-ink/70">
            Средняя: <span className="font-semibold">{formatPercent(efficiencyAverage ?? null)}</span>
            <span className="font-semibold">, {formatPercent(efficiencyCursor ?? null)}</span>
          </span>
          <span className="font-mono font-semibold text-right" style={{ color: '#0b7a75' }}>
            {formatPercent(efficiencyAverage ?? null)}
          </span>
        </div>
      )}
    </div>
  );
}

function getHoverCursorValue(
  snapshot: ChartHoverSnapshot | null,
  testId: number,
  guideMode: ChartGuideMode
): number | null {
  const item = snapshot?.statsByTest.find((entry) => entry.testId === testId);
  if (!item) {
    return null;
  }
  if (guideMode === 'average' && item.trendCursorValue !== null) {
    return item.trendCursorValue;
  }
  return item.cursorValue;
}

type StatGroup =
  | {
      kind: 'linked';
      link: ParameterLink;
      entries: ChartTestStats[];
      averageEfficiency: number | null;
      cursorEfficiency: number | null;
    }
  | {
      kind: 'paired';
      entries: ChartTestStats[];
    }
  | {
      kind: 'single';
      entry: ChartTestStats;
    };

function buildPearsonCorrelationEntries(
  data: ChartDataset | null,
  tests: PearsonCorrelationTest[],
  visibleObjects: ChartDataset['objects']
): PearsonCorrelationEntry[] | null {
  if (!data || tests.length !== 2) {
    return null;
  }

  const [leftTest, rightTest] = tests;
  const entries: PearsonCorrelationEntry[] = [];
  const visibleObjectKeys = new Set(visibleObjects.map((object) => object.objectKey));
  const averagePairs = data.points
    .map((point) => {
      const left = averageValues(point.values, leftTest.testId, visibleObjectKeys);
      const right = averageValues(point.values, rightTest.testId, visibleObjectKeys);
      return [left, right] as const;
    })
    .filter(isNumericPair);

  entries.push({
    key: 'average',
    label: 'Среднее по выбранным объектам',
    ...calculatePearsonCorrelation(averagePairs)
  });

  for (const object of visibleObjects) {
    const objectPairs = data.points
      .map((point) => {
        const left = findPointValue(point.values, leftTest.testId, object.objectKey);
        const right = findPointValue(point.values, rightTest.testId, object.objectKey);
        return [left, right] as const;
      })
      .filter(isNumericPair);

    entries.push({
      key: object.objectKey,
      label: object.objectLabel,
      ...calculatePearsonCorrelation(objectPairs)
    });
  }

  return entries;
}

function calculatePearsonCorrelation(pairs: Array<readonly [number, number]>): {
  coefficient: number | null;
  pairsUsed: number;
  warning: string | null;
} {
  if (pairs.length < 2) {
    return {
      coefficient: null,
      pairsUsed: pairs.length,
      warning: 'Нужно минимум 2 парные точки'
    };
  }

  const averageLeft = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const averageRight = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (const [left, right] of pairs) {
    const leftDelta = left - averageLeft;
    const rightDelta = right - averageRight;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  if (leftVariance === 0 || rightVariance === 0) {
    return {
      coefficient: null,
      pairsUsed: pairs.length,
      warning: 'Один из параметров не меняется'
    };
  }

  return {
    coefficient: covariance / Math.sqrt(leftVariance * rightVariance),
    pairsUsed: pairs.length,
    warning: null
  };
}

function isNumericPair(pair: readonly [number | null, number | null]): pair is readonly [number, number] {
  return (
    typeof pair[0] === 'number' &&
    Number.isFinite(pair[0]) &&
    typeof pair[1] === 'number' &&
    Number.isFinite(pair[1])
  );
}

function buildStatGroups(
  entries: ChartTestStats[],
  parameterLinks: ParameterLink[],
  selectedTestIds: number[],
  selectedObjectKeys: string[],
  guideMode: ChartGuideMode,
  data: ChartDataset | null,
  hoverSnapshot: ChartHoverSnapshot | null
): StatGroup[] {
  const entryById = new Map(entries.map((entry) => [entry.testId, entry]));
  const selected = new Set(selectedTestIds);
  const used = new Set<number>();
  const groups: StatGroup[] = [];

  for (const link of parameterLinks) {
    if (!selected.has(link.inputTestId) || !selected.has(link.outputTestId)) {
      continue;
    }

    const input = entryById.get(link.inputTestId);
    const output = entryById.get(link.outputTestId);
    if (!input || !output) {
      continue;
    }

    groups.push({
      kind: 'linked',
      link,
      entries: [input, output],
      averageEfficiency: calculateAverageEfficiency(data, link, selectedObjectKeys, guideMode),
      cursorEfficiency: calculateCursorEfficiency(data, hoverSnapshot, link, selectedObjectKeys, guideMode)
    });
    used.add(input.testId);
    used.add(output.testId);
  }

  if (groups.length === 0 && entries.length === 2) {
    groups.push({
      kind: 'paired',
      entries
    });
    used.add(entries[0].testId);
    used.add(entries[1].testId);
  }

  for (const entry of entries) {
    if (!used.has(entry.testId)) {
      groups.push({ kind: 'single', entry });
    }
  }

  return groups;
}

function calculateAverageEfficiency(
  data: ChartDataset | null,
  link: ParameterLink,
  selectedObjectKeys: string[],
  guideMode: ChartGuideMode
): number | null {
  if (!data) {
    return null;
  }

  const allowedObjectKeys = new Set(
    selectedObjectKeys.length > 0
      ? selectedObjectKeys
      : data.objects.map((object) => object.objectKey)
  );
  const values = data.points
    .map((point) => calculatePointEfficiency(point.values, link, allowedObjectKeys, guideMode))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateCursorEfficiency(
  data: ChartDataset | null,
  hoverSnapshot: ChartHoverSnapshot | null,
  link: ParameterLink,
  selectedObjectKeys: string[],
  guideMode: ChartGuideMode
): number | null {
  if (!data || !hoverSnapshot) {
    return null;
  }

  if (guideMode === 'average') {
    return calculateEfficiency(
      getHoverCursorValue(hoverSnapshot, link.inputTestId, guideMode),
      getHoverCursorValue(hoverSnapshot, link.outputTestId, guideMode)
    );
  }

  const point = data.points.find((item) => item.date === hoverSnapshot.date);
  if (!point) {
    return null;
  }
  const allowedObjectKeys = new Set(
    selectedObjectKeys.length > 0
      ? selectedObjectKeys
      : data.objects.map((object) => object.objectKey)
  );
  return calculatePointEfficiency(point.values, link, allowedObjectKeys, 'series');
}

function calculatePointEfficiency(
  values: ChartDataset['points'][number]['values'],
  link: ParameterLink,
  allowedObjectKeys: Set<string>,
  guideMode: ChartGuideMode
): number | null {
  if (guideMode === 'average') {
    const inputAverage = averageValues(values, link.inputTestId, allowedObjectKeys);
    const outputAverage = averageValues(values, link.outputTestId, allowedObjectKeys);
    return calculateEfficiency(inputAverage, outputAverage);
  }

  const efficiencies = Array.from(allowedObjectKeys)
    .map((objectKey) => {
      const input = findPointValue(values, link.inputTestId, objectKey);
      const output = findPointValue(values, link.outputTestId, objectKey);
      return calculateEfficiency(input, output);
    })
    .filter((value): value is number => value !== null);

  if (efficiencies.length === 0) {
    return null;
  }
  return efficiencies.reduce((sum, value) => sum + value, 0) / efficiencies.length;
}

function averageValues(
  values: ChartDataset['points'][number]['values'],
  testId: number,
  allowedObjectKeys: Set<string>
): number | null {
  const numeric = values
    .filter((item) => item.testId === testId && allowedObjectKeys.has(item.objectKey))
    .map((item) => item.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (numeric.length === 0) {
    return null;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function findPointValue(
  values: ChartDataset['points'][number]['values'],
  testId: number,
  objectKey: string
): number | null {
  return values.find((item) => item.testId === testId && item.objectKey === objectKey)?.value ?? null;
}

function calculateEfficiency(input: number | null, output: number | null): number | null {
  if (input === null || output === null || input === 0) {
    return null;
  }
  return ((input - output) / input) * 100;
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${formatNumber(value, 1)}%`;
}

function formatCorrelation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return formatNumber(Math.max(-1, Math.min(1, value)), 4);
}

function describeCorrelation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Недостаточно данных';
  }

  const absolute = Math.abs(value);
  const direction = value > 0 ? 'прямая' : value < 0 ? 'обратная' : 'нет линейной связи';
  if (absolute >= 0.9) {
    return `Очень сильная ${direction}`;
  }
  if (absolute >= 0.7) {
    return `Сильная ${direction}`;
  }
  if (absolute >= 0.5) {
    return `Умеренная ${direction}`;
  }
  if (absolute >= 0.3) {
    return `Слабая ${direction}`;
  }
  return 'Линейная связь почти не выражена';
}

function getCorrelationColor(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '#6b7280';
  }
  const absolute = Math.abs(value);
  if (absolute >= 0.7) {
    return '#0b7a75';
  }
  if (absolute >= 0.3) {
    return '#b45309';
  }
  return '#6b7280';
}

function formatRSquared(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return Number(value.toFixed(4)).toString();
}

function formatMode(mode: ChartTrendlineReport['mode']): string {
  switch (mode) {
    case 'linear':
      return 'Линейная';
    case 'power':
      return 'Степенная';
    case 'exponential':
      return 'Экспоненциальная';
    case 'polynomial':
      return 'Полиномиальная';
    case 'logarithmic':
      return 'Логарифмическая';
    case 'linear_filter':
      return 'Линейная фильтрация';
    case 'moving_average':
      return 'Скользящая средняя';
    case 'ema':
      return 'EMA';
  }
}
