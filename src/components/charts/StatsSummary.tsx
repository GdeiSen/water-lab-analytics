'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Maximize2, Minimize2, Search } from 'lucide-react';

import type {
  ChartDataset,
  ChartHoverSnapshot,
  ChartTestStats,
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

export function StatsSummary({
  data,
  hoverSnapshot,
  selectedTestIds,
  selectedObjectKeys,
  parameterLinks,
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
  const statGroups = useMemo(
    () =>
      buildStatGroups(
        statsEntries,
        parameterLinks,
        selectedTestIds,
        selectedObjectKeys,
        data,
        hoverSnapshot
      ),
    [data, hoverSnapshot, parameterLinks, selectedObjectKeys, selectedTestIds, statsEntries]
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
            return (
              <div key={`linked-${group.link.id}`} className="md:col-span-2">
                <div className="border border-ink/15 bg-[#f7f8fa] px-3 py-2 text-ink">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide">
                      Эффективность: {group.link.label}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="border border-ink/15 bg-white px-2 py-0.5">
                        Средняя: {formatPercent(group.averageEfficiency)}
                      </span>
                      <span className="border border-ink/15 bg-white px-2 py-0.5">
                        {formatPercent(group.cursorEfficiency)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 border-x border-b border-ink/20 bg-white p-2 md:grid-cols-2">
                  {group.entries.map((entry) => (
                    <StatsCard
                      key={entry.testId}
                      entry={entry}
                      color={testColorById.get(entry.testId) ?? TANK_COLORS[0]}
                      hoverValue={getHoverCursorValue(hoverSnapshot, entry.testId)}
                    />
                  ))}
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
              hoverValue={getHoverCursorValue(hoverSnapshot, entry.testId)}
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
  hoverValue
}: {
  entry: ChartTestStats;
  color: string;
  hoverValue: number | null;
}) {
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

function getHoverCursorValue(snapshot: ChartHoverSnapshot | null, testId: number): number | null {
  const item = snapshot?.statsByTest.find((entry) => entry.testId === testId);
  if (!item) {
    return null;
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
      kind: 'single';
      entry: ChartTestStats;
    };

function buildStatGroups(
  entries: ChartTestStats[],
  parameterLinks: ParameterLink[],
  selectedTestIds: number[],
  selectedObjectKeys: string[],
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
      averageEfficiency: calculateAverageEfficiency(data, link, selectedObjectKeys),
      cursorEfficiency: calculateEfficiency(
        getHoverCursorValue(hoverSnapshot, input.testId),
        getHoverCursorValue(hoverSnapshot, output.testId)
      )
    });
    used.add(input.testId);
    used.add(output.testId);
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
  selectedObjectKeys: string[]
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
    .flatMap((point) => {
      const objectKeys = Array.from(new Set(point.values.map((item) => item.objectKey))).filter(
        (objectKey) => allowedObjectKeys.has(objectKey)
      );
      return objectKeys.map((objectKey) => {
        const input = findPointValue(point.values, link.inputTestId, objectKey);
        const output = findPointValue(point.values, link.outputTestId, objectKey);
        return calculateEfficiency(input, output);
      });
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
