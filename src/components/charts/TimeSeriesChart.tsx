"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ImageDown,
  Maximize2,
  Minimize2,
  Printer,
} from "lucide-react";
import {
  Customized,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";

import { resolveEffectiveOptimization } from "@/lib/chart-optimization";
import { computeTrendline } from "@/lib/trendlines";
import { Spinner } from "@/components/ui/Spinner";
import type {
  ChartDataset,
  ChartGuideMode,
  ChartHoverSnapshot,
  ChartHoverTestStats,
  ChartOptimizationSettings,
  ChartTrendlineReport,
  ChartTrendlineSettings,
  ChartValuePoint,
  ChartTest,
} from "@/lib/types";
import { TANK_COLORS } from "@/lib/utils";

interface TimeSeriesChartProps {
  data: ChartDataset | null;
  isLoading: boolean;
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  showAverage: boolean;
  guideMode: ChartGuideMode;
  optimization: ChartOptimizationSettings;
  trendline: ChartTrendlineSettings;
  height: number;
  uiScale: number;
  onHoverChange?: (snapshot: ChartHoverSnapshot | null) => void;
  onTrendlinesChange?: (reports: ChartTrendlineReport[]) => void;
  onExportPng?: () => void;
  onPrintChart?: () => void;
  /**
   * Overrides how the X axis's `date` value is displayed. Defaults to
   * `formatXAxisDate` (calendar date formatting). Period-overlay mode
   * passes a formatter for ordinal phase positions ("Месяц 3") instead of
   * calendar dates — see src/lib/period-overlay.ts.
   */
  xTickFormatter?: (value: string) => string;
  /** Minimum pixel gap between X axis ticks. Defaults to 28 (dense calendar dates). */
  xMinTickGap?: number;
}

type ChartRow = Record<string, string | number | null>;
interface ApproximationOptions {
  movingAverageWindow: number;
  emaAlpha: number;
}

interface SeriesMeta {
  testId: number;
  testName: string;
  objectKey: string;
  objectLabel: string;
  key: string;
  color: string;
}

interface TrendlineMeta {
  key: string;
  dataKey: string;
  testId: number;
  label: string;
  color: string;
  report: ChartTrendlineReport;
}

interface PreparedChart {
  rows: ChartRow[];
  sourceRows: ChartRow[];
  tests: ChartTest[];
  series: SeriesMeta[];
  trendlines: TrendlineMeta[];
  visibleAverageTestIds: Set<number>;
}

interface AxisGroup {
  axisId: string;
  orientation: "left";
  sideIndex: number;
  domain: [number, number];
  ticks: number[];
  minorTicks: number[];
  step: number;
  divisionsCount: number;
  canIncrease: boolean;
  canDecrease: boolean;
  tests: ChartTest[];
}

interface GuideLabelViewBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface GuideLabelProps {
  x?: number;
  y?: number;
  viewBox?: GuideLabelViewBox;
}

interface GuideFrame {
  cursorX: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
}

interface HoverGuideState {
  date: string;
  averageByTest: Record<number, number | null>;
  seriesByKey: Record<string, number | null>;
  trendByKey: Record<string, number | null>;
}

interface GuideValueSpec {
  key: string;
  axisId: string;
  value: number;
  color: string;
  dashArray?: string;
}

interface GuideChartState {
  yAxisMap?: Record<string, { scale?: unknown }>;
  offset?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
}

const AXIS_WIDTH = 36;
const AXIS_STROKE = "#6b7280";
const AXIS_TO_PLOT_GAP = 10;
const MAJOR_GRID_STROKE = "#d0d7df";
const MINOR_GRID_STROKE = "#e8ecf0";
const AXIS_CONTROL_ZONE_WIDTH = 24;
const AXIS_CONTROL_BUTTON_SIZE = 18;
const AXIS_CONTROL_VERTICAL_INSET = 2;

export function TimeSeriesChart({
  data,
  isLoading,
  selectedTestIds,
  selectedObjectKeys,
  showAverage,
  guideMode,
  optimization,
  trendline,
  height,
  uiScale,
  onHoverChange,
  onTrendlinesChange,
  onExportPng,
  onPrintChart,
  xTickFormatter,
  xMinTickGap,
}: TimeSeriesChartProps) {
  const resolvedXTickFormatter = xTickFormatter ?? formatXAxisDate;
  const resolvedXMinTickGap = xMinTickGap ?? 28;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const [hoverGuide, setHoverGuide] = useState<HoverGuideState | null>(null);
  const [lockedGuide, setLockedGuide] = useState<HoverGuideState | null>(null);
  const [hoverFrame, setHoverFrame] = useState<GuideFrame | null>(null);
  const [lockedFrame, setLockedFrame] = useState<GuideFrame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [hoveredAxisId, setHoveredAxisId] = useState<string | null>(null);
  const [axisDensityOffsets, setAxisDensityOffsets] = useState<
    Record<string, number>
  >({});
  const [hoveredLegendKey, setHoveredLegendKey] = useState<string | null>(null);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<Set<string>>(new Set());

  const clearInteractions = useCallback(() => {
    setHoverGuide(null);
    setLockedGuide(null);
    setHoverFrame(null);
    setLockedFrame(null);
    setHoveredAxisId(null);
    onHoverChange?.(null);
  }, [onHoverChange]);

  const selectedTests = useMemo(() => {
    if (!data) {
      return [] as ChartTest[];
    }
    if (selectedTestIds.length === 0) {
      return data.tests;
    }
    const byId = new Map(data.tests.map((test) => [test.testId, test]));
    return selectedTestIds
      .map((id) => byId.get(id))
      .filter((test): test is ChartTest => Boolean(test));
  }, [data, selectedTestIds]);

  const selectedObjects = useMemo(() => {
    if (!data) {
      return [];
    }
    const byKey = new Map(
      data.objects.map((object) => [object.objectKey, object]),
    );
    return selectedObjectKeys
      .map((key) => byKey.get(key))
      .filter((object): object is NonNullable<typeof object> =>
        Boolean(object),
      );
  }, [data, selectedObjectKeys]);

  const testColorById = useMemo(() => {
    const map = new Map<number, string>();
    selectedTests.forEach((test, index) => {
      map.set(test.testId, TANK_COLORS[index % TANK_COLORS.length]);
    });
    return map;
  }, [selectedTests]);

  const trendColorById = useMemo(() => {
    const map = new Map<number, string>();
    selectedTests.forEach((test, index) => {
      map.set(test.testId, darkenColor(TANK_COLORS[index % TANK_COLORS.length], 0.38));
    });
    return map;
  }, [selectedTests]);

  const prepared = useMemo(() => {
    if (!data || selectedTests.length === 0 || selectedObjectKeys.length === 0) {
      return {
        rows: [],
        sourceRows: [],
        tests: selectedTests,
        series: [],
        trendlines: [],
        visibleAverageTestIds: new Set<number>(),
      } satisfies PreparedChart;
    }

    const series = selectedTests.flatMap((test, testIndex) =>
      selectedObjects.map((object, objectIndex) => ({
        testId: test.testId,
        testName: test.testName,
        objectKey: object.objectKey,
        objectLabel: object.objectLabel,
        key: getSeriesKey(test.testId, object.objectKey),
        color:
          TANK_COLORS[
            (testIndex * selectedObjects.length + objectIndex) %
              TANK_COLORS.length
          ],
      })),
    );

    const averageKeys = selectedTests.map((test) => getAverageKey(test.testId));

    const baseRows = data.points.map((point) => {
      const row: ChartRow = { date: point.date };
      const valueMap = new Map(
        point.values.map((item) => [
          getSeriesKey(item.testId, item.objectKey),
          item.value,
        ]),
      );
      for (const item of series) {
        row[item.key] = valueMap.get(item.key) ?? null;
      }
      for (const test of selectedTests) {
        const selectedAverage = calculateAverageForSelectedObjects(
          point.values,
          test.testId,
          selectedObjects,
        );
        row[getAverageKey(test.testId)] =
          selectedObjects.length > 0
            ? selectedAverage
            : null;
      }
      for (const object of selectedObjects) {
        row[getObjectAverageKey(object.objectKey)] =
          calculateAverageForSelectedTests(
            point.values,
            object.objectKey,
            selectedTests,
          );
      }

      return row;
    });

    const objectAverageKeys = selectedObjects.map((object) =>
      getObjectAverageKey(object.objectKey),
    );

    const effective = resolveEffectiveOptimization(
      optimization,
      baseRows.length,
    );
    const seriesKeys = series.map((item) => item.key);
    const compressed = compressRows(
      baseRows,
      [...seriesKeys, ...averageKeys, ...objectAverageKeys],
      effective.pointCompression,
    );

    for (const key of seriesKeys) {
      const values = compressed.map((row) => toNullableNumber(row[key]));
      const approximated = applyApproximation(
        values,
        effective.lineApproximation,
        {
          movingAverageWindow: effective.movingAverageWindow,
          emaAlpha: effective.emaAlpha,
        },
      );
      approximated.forEach((value, index) => {
        compressed[index][key] = value;
      });
    }

    for (const test of selectedTests) {
      const averageKey = getAverageKey(test.testId);
      const baseAverage = compressed.map((row) =>
        toNullableNumber(row[averageKey]),
      );
      const approximatedAverage = applyApproximation(
        baseAverage,
        effective.averageApproximation,
        {
          movingAverageWindow: effective.averageMovingAverageWindow,
          emaAlpha: effective.averageEmaAlpha,
        },
      );
      approximatedAverage.forEach((value, index) => {
        compressed[index][averageKey] = value;
      });
    }

    for (const object of selectedObjects) {
      const objAvgKey = getObjectAverageKey(object.objectKey);
      const baseObjectAvg = compressed.map((row) =>
        toNullableNumber(row[objAvgKey]),
      );
      const approximatedObjectAvg = applyApproximation(
        baseObjectAvg,
        effective.averageApproximation,
        {
          movingAverageWindow: effective.averageMovingAverageWindow,
          emaAlpha: effective.averageEmaAlpha,
        },
      );
      approximatedObjectAvg.forEach((value, index) => {
        compressed[index][objAvgKey] = value;
      });
    }

    const visibleSeries = series.filter((item) => rowsHaveNumericValue(compressed, item.key));

    const localSeriesByTest = new Map<number, string[]>();
    for (const item of visibleSeries) {
      if (!localSeriesByTest.has(item.testId)) {
        localSeriesByTest.set(item.testId, []);
      }
      localSeriesByTest.get(item.testId)?.push(item.key);
    }

    const visibleAverageTestIds = new Set<number>();
    for (const test of selectedTests) {
      const averageKey = getAverageKey(test.testId);
      const testSeriesKeys = localSeriesByTest.get(test.testId) ?? [];
      const duplicatesSeries = testSeriesKeys.some((seriesKey) =>
        seriesMatches(compressed, averageKey, seriesKey),
      );

      if (!duplicatesSeries) {
        visibleAverageTestIds.add(test.testId);
      }
    }

    const trendlines = buildTrendlines({
      settings: trendline,
      tests: selectedTests,
      objects: selectedObjects,
      sourceRows: baseRows,
      displayRows: compressed,
      testColorById,
    });

    return {
      rows: compressed,
      sourceRows: baseRows,
      tests: selectedTests,
      series: visibleSeries,
      trendlines,
      visibleAverageTestIds,
    } satisfies PreparedChart;
  }, [data, optimization, selectedObjectKeys.length, selectedObjects, selectedTests, testColorById, trendline]);

  const seriesByTest = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const item of prepared.series) {
      if (!map.has(item.testId)) {
        map.set(item.testId, []);
      }
      map.get(item.testId)?.push(item.key);
    }
    return map;
  }, [prepared.series]);

  const visibleAverageTestIds = prepared.visibleAverageTestIds;
  const hasVisibleAverageLine =
    showAverage &&
    prepared.tests.some(
      (test) =>
        visibleAverageTestIds.has(test.testId) &&
        rowsHaveNumericValue(prepared.rows, getAverageKey(test.testId)),
    );
  const hasVisibleTrendline =
    trendline.enabled &&
    prepared.trendlines.some((item) => rowsHaveNumericValue(prepared.rows, item.dataKey));

  const axisLayout = useMemo(() => {
    const grouped = new Map<
      string,
      {
        min: number;
        max: number;
        tests: ChartTest[];
      }
    >();

    for (const test of prepared.tests) {
      const keys = [...(seriesByTest.get(test.testId) ?? [])];
      if (showAverage && visibleAverageTestIds.has(test.testId)) {
        keys.push(getAverageKey(test.testId));
      }
      for (const item of prepared.trendlines) {
        if (item.testId === test.testId) {
          keys.push(item.dataKey);
        }
      }
      if (keys.length === 0) {
        continue;
      }

      const range = getValueRange(prepared.rows, keys);
      if (!range) {
        continue;
      }
      const signature = `${normalizeDomainValue(range[0])}:${normalizeDomainValue(range[1])}`;

      const bucket = grouped.get(signature);
      if (!bucket) {
        grouped.set(signature, { min: range[0], max: range[1], tests: [test] });
        continue;
      }
      bucket.tests.push(test);
    }

    const groups: AxisGroup[] = Array.from(grouped.values()).map((entry, index) => {
      const axisId = `axis_group_${index}`;
      const offset = axisDensityOffsets[axisId] ?? 0;
      const scaleConfig = resolveAxisScale(entry.min, entry.max, offset);

      return {
        axisId,
        orientation: "left" as const,
        sideIndex: index,
        domain: scaleConfig.domain,
        ticks: scaleConfig.ticks,
        minorTicks: scaleConfig.minorTicks,
        step: scaleConfig.step,
        divisionsCount: scaleConfig.divisionsCount,
        canIncrease: scaleConfig.canIncrease,
        canDecrease: scaleConfig.canDecrease,
        tests: entry.tests,
      };
    });

    if (groups.length === 0 && prepared.tests.length > 0) {
      const scaleConfig = resolveAxisScale(
        0,
        1,
        axisDensityOffsets["axis_group_0"] ?? 0,
      );
      groups.push({
        axisId: "axis_group_0",
        orientation: "left",
        sideIndex: 0,
        domain: scaleConfig.domain,
        ticks: scaleConfig.ticks,
        minorTicks: scaleConfig.minorTicks,
        step: scaleConfig.step,
        divisionsCount: scaleConfig.divisionsCount,
        canIncrease: scaleConfig.canIncrease,
        canDecrease: scaleConfig.canDecrease,
        tests: [...prepared.tests],
      });
    }

    const leftIndex = groups.length;

    const axisByTest = new Map<number, string>();
    for (const group of groups) {
      for (const test of group.tests) {
        axisByTest.set(test.testId, group.axisId);
      }
    }

    return {
      groups,
      axisByTest,
      leftCount: leftIndex,
      rightCount: 0,
    };
  }, [
    axisDensityOffsets,
    prepared.rows,
    prepared.tests,
    prepared.trendlines,
    seriesByTest,
    showAverage,
    visibleAverageTestIds,
  ]);

  useEffect(() => {
    const availableAxisIds = new Set(
      axisLayout.groups.map((group) => group.axisId),
    );

    setAxisDensityOffsets((previous) => {
      let hasChanges = false;
      const next: Record<string, number> = {};

      for (const [axisId, value] of Object.entries(previous)) {
        if (availableAxisIds.has(axisId)) {
          next[axisId] = value;
        } else {
          hasChanges = true;
        }
      }

      return hasChanges ? next : previous;
    });

    setHoveredAxisId((current) =>
      current && availableAxisIds.has(current) ? current : null,
    );
  }, [axisLayout.groups]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const element = containerRef.current;
      setIsFullscreen(
        Boolean(element && document.fullscreenElement === element),
      );
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPseudoFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    if (!data || selectedTestIds.length === 0) {
      clearInteractions();
    }
  }, [clearInteractions, data, selectedTestIds.length]);

  useEffect(() => {
    onTrendlinesChange?.(prepared.trendlines.map((item) => item.report));
  }, [onTrendlinesChange, prepared.trendlines]);

  useEffect(() => {
    const availableSeriesKeys = new Set(prepared.series.map((series) => series.key));
    setHiddenSeriesKeys((previous) => {
      const next = new Set(
        Array.from(previous).filter((seriesKey) => availableSeriesKeys.has(seriesKey)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [prepared.series]);

  const interactiveSeries = prepared.series.filter(
    (series) => !hiddenSeriesKeys.has(series.key),
  );

  if (isLoading && (!data || prepared.rows.length === 0)) {
    return (
      <ChartMessage height={height}>
        <Spinner size="md" />
        <span>Загрузка данных графика...</span>
      </ChartMessage>
    );
  }

  if (
    !data ||
    prepared.rows.length === 0 ||
    (prepared.series.length === 0 && !hasVisibleAverageLine && !hasVisibleTrendline)
  ) {
    return (
      <ChartMessage height={height}>Нет данных для отображения графика.</ChartMessage>
    );
  }

  const leftMargin = AXIS_TO_PLOT_GAP;
  const rightMargin = 6;
  const activeGuide = lockedGuide ?? hoverGuide;
  const activeFrame = lockedFrame ?? hoverFrame;
  const fallbackAxisId = axisLayout.groups[0]?.axisId ?? "axis_fallback";
  const activeGuideSpecs = activeGuide
    ? buildGuideValueSpecs({
        guide: activeGuide,
        guideMode,
        series: interactiveSeries,
        trendlines: prepared.trendlines,
        tests: prepared.tests,
        axisByTest: axisLayout.axisByTest,
        testColorById,
        fallbackAxisId,
        showAverage,
        trendColorById,
      })
    : [];
  const lockedGuideSpecs = lockedGuide
    ? buildGuideValueSpecs({
        guide: lockedGuide,
        guideMode,
        series: interactiveSeries,
        trendlines: prepared.trendlines,
        tests: prepared.tests,
        axisByTest: axisLayout.axisByTest,
        testColorById,
        fallbackAxisId,
        showAverage,
        trendColorById,
      })
    : [];
  const isExpanded = isFullscreen || isPseudoFullscreen;
  const scale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const axisWidth = Math.round(AXIS_WIDTH * scale);
  const axisControlZoneWidth = Math.round(AXIS_CONTROL_ZONE_WIDTH * scale);
  const axisControlButtonSize = Math.round(AXIS_CONTROL_BUTTON_SIZE * scale);
  const axisControlInset = Math.round(AXIS_CONTROL_VERTICAL_INSET * scale);
  const tickFontSize = Math.round(11 * scale);
  const guideFontSize = Math.round(10 * scale);
  const guideLabelHeight = Math.round(12 * scale);
  const xAxisHeight = Math.round(24 * scale);
  const axisViewportHeight = chartViewportRef.current?.clientHeight ?? height;
  const axisPlotTop = Math.round(8 * scale);
  const axisPlotBottom = Math.round(36 * scale);
  const axisPlotHeight = Math.max(
    Math.round(36 * scale),
    axisViewportHeight - axisPlotTop - axisPlotBottom,
  );
  const axisPlotLeft = leftMargin + axisLayout.leftCount * axisWidth;
  const axisStripWidth = Math.round(26 * scale);
  const axisStripHeight = Math.max(2, 3 * scale);
  const axisStripGap = Math.max(2, 2.5 * scale);
  const axisStripTop = axisPlotTop + axisPlotHeight + 6 * scale;

  const adjustAxisDensity = (axisId: string, delta: number) => {
    setAxisDensityOffsets((previous) => {
      const current = previous[axisId] ?? 0;
      const next = current + delta;
      return {
        ...previous,
        [axisId]: next,
      };
    });
  };

  const computeGuideFrame = (state: unknown): GuideFrame | null => {
    const candidate = state as {
      activeCoordinate?: { x?: number } | null;
      chartX?: number;
      offset?: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
      } | null;
    };

    const cursorXFromState =
      asNumber(candidate?.activeCoordinate?.x) ?? asNumber(candidate?.chartX);
    const offsetLeft = asNumber(candidate?.offset?.left);
    const offsetTop = asNumber(candidate?.offset?.top);
    const offsetWidth = asNumber(candidate?.offset?.width);
    const offsetHeight = asNumber(candidate?.offset?.height);

    if (
      cursorXFromState !== null &&
      offsetLeft !== null &&
      offsetTop !== null &&
      offsetWidth !== null &&
      offsetHeight !== null
    ) {
      return {
        cursorX: cursorXFromState,
        plotLeft: offsetLeft,
        plotTop: offsetTop,
        plotWidth: offsetWidth,
        plotHeight: offsetHeight,
      };
    }

    const viewport = chartViewportRef.current;
    if (!viewport || cursorXFromState === null) {
      return null;
    }

    const derivedPlotTop = 8 * scale;
    const derivedPlotBottom = 8 * scale;
    const derivedPlotLeft = leftMargin + axisLayout.leftCount * axisWidth;
    const derivedPlotWidth = Math.max(
      1,
      viewport.clientWidth - derivedPlotLeft - rightMargin,
    );
    const derivedPlotHeight = Math.max(
      1,
      viewport.clientHeight - derivedPlotTop - derivedPlotBottom,
    );
    const clampedCursorX = clamp(
      cursorXFromState,
      derivedPlotLeft,
      derivedPlotLeft + derivedPlotWidth,
    );

    return {
      cursorX: clampedCursorX,
      plotLeft: derivedPlotLeft,
      plotTop: derivedPlotTop,
      plotWidth: derivedPlotWidth,
      plotHeight: derivedPlotHeight,
    };
  };

  const buildHoverData = (row: ChartRow) => {
    const statsByTest = prepared.tests.map((test) => {
      const keys = interactiveSeries
        .filter((series) => series.testId === test.testId)
        .map((series) => series.key);
      const values = keys
        .map((key) => toNullableNumber(row[key]))
        .filter((value): value is number => value !== null);
      const averageValue =
        toNullableNumber(row[getAverageKey(test.testId)]) ??
        (values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null);

      const trendValues = prepared.trendlines
        .filter((item) => item.testId === test.testId)
        .map((item) => toNullableNumber(row[item.dataKey]))
        .filter((value): value is number => value !== null);
      const trendValue =
        trendValues.length > 0
          ? trendValues.reduce((sum, value) => sum + value, 0) /
            trendValues.length
          : null;

      return {
        testId: test.testId,
        min: null,
        max: null,
        average: null,
        median: null,
        stdDev: null,
        cursorValue: averageValue,
        trendCursorValue: trendValue,
      } satisfies ChartHoverTestStats;
    });

    const cursorByTest: Record<number, number | null> = {};
    for (const item of statsByTest) {
      cursorByTest[item.testId] = item.cursorValue;
    }

    const seriesByKey: Record<string, number | null> = {};
    for (const series of interactiveSeries) {
      seriesByKey[series.key] = toNullableNumber(row[series.key]);
    }

    const trendByKey: Record<string, number | null> = {};
    for (const item of prepared.trendlines) {
      trendByKey[item.key] = toNullableNumber(row[item.dataKey]);
    }

    return {
      guide: {
        date: String(row.date),
        averageByTest: cursorByTest,
        seriesByKey,
        trendByKey,
      },
      snapshot: {
        date: String(row.date),
        statsByTest,
      } satisfies ChartHoverSnapshot,
    };
  };

  const toggleFullscreen = async () => {
    const element = containerRef.current;
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

  return (
    <div
      ref={containerRef}
      id="time-series-chart"
      className={`border border-ink/20 bg-white ${
        isExpanded ? "fixed inset-0 z-[100] h-screen w-screen" : ""
      }`}
      style={{ height: isExpanded ? "100vh" : height }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          ref={chartViewportRef}
          className="relative min-h-0 flex-1"
          style={{
            paddingTop: 12 * scale,
            paddingRight: 12 * scale,
            paddingBottom: 4 * scale,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={prepared.rows}
              margin={{
                top: 8,
                right: rightMargin,
                left: leftMargin,
                bottom: 8,
              }}
              onMouseMove={(state) => {
                if (lockedGuide) {
                  return;
                }
                if (!onHoverChange) {
                  if (!state?.activePayload?.[0]?.payload) {
                    setHoverGuide(null);
                  }
                }
                const row = state?.activePayload?.[0]?.payload as
                  | ChartRow
                  | undefined;
                if (!row || typeof row.date !== "string") {
                  setHoverGuide(null);
                  setHoverFrame(null);
                  onHoverChange?.(null);
                  return;
                }

                const hoverData = buildHoverData(row);
                const frame = computeGuideFrame(state);
                onHoverChange?.(hoverData.snapshot);
                setHoverGuide(hoverData.guide);
                setHoverFrame(frame);
              }}
              onClick={(state) => {
                if (lockedGuide) {
                  setLockedGuide(null);
                  setLockedFrame(null);
                  setHoverGuide(null);
                  setHoverFrame(null);
                  onHoverChange?.(null);
                  return;
                }

                const row = state?.activePayload?.[0]?.payload as
                  | ChartRow
                  | undefined;
                if (!row || typeof row.date !== "string") {
                  return;
                }
                const hoverData = buildHoverData(row);
                const frame = computeGuideFrame(state);
                setLockedGuide(hoverData.guide);
                setLockedFrame(frame);
                setHoverGuide(hoverData.guide);
                setHoverFrame(frame);
                onHoverChange?.(hoverData.snapshot);
              }}
              onMouseLeave={() => {
                setHoveredAxisId(null);
                if (lockedGuide) {
                  return;
                }
                setHoverGuide(null);
                setHoverFrame(null);
                onHoverChange?.(null);
              }}
            >
              {/* Background solid grid lines and minor axis tick marks */}
              <Customized
                key="chart-background-grid"
                component={(chartProps: unknown) => {
                  const chartState = chartProps as GuideChartState;
                  const yAxisMap = chartState?.yAxisMap ?? {};
                  const plotLeft =
                    asNumber(chartState?.offset?.left) ??
                    (activeFrame?.plotLeft ?? axisPlotLeft);
                  const plotTop =
                    asNumber(chartState?.offset?.top) ??
                    (activeFrame?.plotTop ?? axisPlotTop);
                  const plotWidth =
                    asNumber(chartState?.offset?.width) ??
                    (activeFrame?.plotWidth ?? 0);
                  const plotHeight =
                    asNumber(chartState?.offset?.height) ??
                    (activeFrame?.plotHeight ?? axisPlotHeight);
                  const plotRight = plotLeft + plotWidth;
                  const plotBottom = plotTop + plotHeight;

                  const primaryGroup = axisLayout.groups[0];
                  const primaryYAxis = primaryGroup
                    ? (yAxisMap[primaryGroup.axisId] as
                        | { scale?: (val: number) => number }
                        | undefined)
                    : undefined;
                  const primaryScale = primaryYAxis?.scale;

                  return (
                    <g className="recharts-custom-background-grid">
                      {/* Minor grid horizontal solid lines */}
                      {primaryGroup?.minorTicks.map((val, idx) => {
                        const y =
                          typeof primaryScale === "function"
                            ? primaryScale(val)
                            : valueToPixel(
                                val,
                                primaryGroup.domain,
                                plotTop,
                                plotHeight,
                              );

                        if (y < plotTop - 0.5 || y > plotBottom + 0.5) {
                          return null;
                        }

                        return (
                          <line
                            key={`grid-minor-${idx}`}
                            x1={plotLeft}
                            y1={y}
                            x2={plotRight}
                            y2={y}
                            stroke={MINOR_GRID_STROKE}
                            strokeWidth={1}
                          />
                        );
                      })}

                      {/* Major grid horizontal solid lines */}
                      {primaryGroup?.ticks.map((val, idx) => {
                        const y =
                          typeof primaryScale === "function"
                            ? primaryScale(val)
                            : valueToPixel(
                                val,
                                primaryGroup.domain,
                                plotTop,
                                plotHeight,
                              );

                        if (y < plotTop - 0.5 || y > plotBottom + 0.5) {
                          return null;
                        }

                        return (
                          <line
                            key={`grid-major-${idx}`}
                            x1={plotLeft}
                            y1={y}
                            x2={plotRight}
                            y2={y}
                            stroke={MAJOR_GRID_STROKE}
                            strokeWidth={1}
                          />
                        );
                      })}

                      {/* Minor tick marks on every Y-axis */}
                      {axisLayout.groups.map((group) => {
                        const yAxisObj = yAxisMap[group.axisId] as
                          | { scale?: (val: number) => number }
                          | undefined;
                        const axisScale = yAxisObj?.scale;
                        const axisLineX =
                          plotLeft - group.sideIndex * axisWidth;

                        return (
                          <g key={`minor-ticks-group-${group.axisId}`}>
                            {group.minorTicks.map((val, idx) => {
                              const y =
                                typeof axisScale === "function"
                                  ? axisScale(val)
                                  : valueToPixel(
                                      val,
                                      group.domain,
                                      plotTop,
                                      plotHeight,
                                    );

                              if (y < plotTop - 0.5 || y > plotBottom + 0.5) {
                                return null;
                              }

                              return (
                                <line
                                  key={`minor-tick-${group.axisId}-${idx}`}
                                  x1={axisLineX}
                                  y1={y}
                                  x2={axisLineX - 3.5 * scale}
                                  y2={y}
                                  stroke={AXIS_STROKE}
                                  strokeWidth={0.9 * scale}
                                  strokeOpacity={0.6}
                                />
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  );
                }}
              />
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                minTickGap={resolvedXMinTickGap * scale}
                tickFormatter={(value) => resolvedXTickFormatter(String(value))}
                tick={{ fontSize: tickFontSize, fill: AXIS_STROKE }}
                tickLine={{ stroke: AXIS_STROKE }}
                axisLine={{ stroke: AXIS_STROKE }}
                tickMargin={12 * scale}
                height={xAxisHeight}
              />

              {axisLayout.groups.map((group) => (
                <YAxis
                  key={group.axisId}
                  yAxisId={group.axisId}
                  orientation={group.orientation}
                  width={axisWidth}
                  stroke={AXIS_STROKE}
                  tick={{ fontSize: tickFontSize, fill: AXIS_STROKE }}
                  tickLine={{ stroke: AXIS_STROKE }}
                  axisLine={{ stroke: AXIS_STROKE }}
                  domain={[group.domain[0], group.domain[1]]}
                  ticks={group.ticks}
                  tickFormatter={formatAxisTick}
                  allowDataOverflow
                />
              ))}

              {prepared.series.map((series) => {
                  if (hiddenSeriesKeys.has(series.key)) {
                    return null;
                  }
                  const isDimmed =
                    hoveredLegendKey !== null &&
                    hoveredLegendKey !== series.key;
                  return (
                    <Line
                      key={series.key}
                      yAxisId={
                        axisLayout.axisByTest.get(series.testId) ?? fallbackAxisId
                      }
                      type="monotone"
                      dataKey={series.key}
                      name={composeSeriesName(series.testName, series.objectLabel)}
                      stroke={series.color}
                      dot={false}
                      isAnimationActive
                      strokeWidth={1.8 * scale}
                      connectNulls
                      strokeOpacity={isDimmed ? 0.12 : 1}
                    />
                  );
                })}

              {trendline.enabled &&
                prepared.trendlines.map((item) => {
                  const isSmoothing =
                    item.report.mode === "moving_average" ||
                    item.report.mode === "ema" ||
                    item.report.mode === "linear_filter";
                  return (
                    <Line
                      key={item.key}
                      yAxisId={
                        axisLayout.axisByTest.get(item.testId) ?? fallbackAxisId
                      }
                      type="monotone"
                      dataKey={item.dataKey}
                      name={`${item.label} (тренд)`}
                      stroke={item.color}
                      strokeDasharray={isSmoothing ? "6 4" : "3 3"}
                      dot={false}
                      isAnimationActive
                      strokeWidth={(isSmoothing ? 2.2 : 1.6) * scale}
                      connectNulls
                      strokeOpacity={hoveredLegendKey !== null ? 0.12 : 1}
                    />
                  );
                })}

              {activeGuide && (
                <ReferenceLine
                  x={activeGuide.date}
                  yAxisId={fallbackAxisId}
                  stroke="#b91c1c"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  isFront
                  label={(props: GuideLabelProps) =>
                    renderVerticalGuideLabel(
                      props,
                      xTickFormatter
                        ? xTickFormatter(activeGuide.date)
                        : formatGuideDate(activeGuide.date),
                    )
                  }
                />
              )}

              {lockedGuide &&
                lockedGuideSpecs.map((guide) => (
                  <ReferenceDot
                    key={`locked-dot-${guide.key}`}
                    yAxisId={guide.axisId}
                    x={lockedGuide.date}
                    y={guide.value}
                    r={3.5 * scale}
                    fill={guide.color}
                    stroke="#ffffff"
                    strokeWidth={1 * scale}
                    ifOverflow="extendDomain"
                    isFront
                  />
                ))}

              {/* Foreground interactive hover guide overlay */}
              <Customized
                key="chart-hover-guides"
                component={(chartProps: unknown) => {
                  if (!activeGuide || !activeFrame) {
                    return null;
                  }

                  const chartState = chartProps as GuideChartState;
                  const yAxisMap = chartState?.yAxisMap ?? {};
                  const plotLeft =
                    asNumber(chartState?.offset?.left) ??
                    activeFrame.plotLeft;
                  const plotTop =
                    asNumber(chartState?.offset?.top) ??
                    activeFrame.plotTop;
                  const plotWidth =
                    asNumber(chartState?.offset?.width) ??
                    activeFrame.plotWidth;
                  const plotHeight =
                    asNumber(chartState?.offset?.height) ??
                    activeFrame.plotHeight;
                  const plotBottom = plotTop + plotHeight;
                  const cursorX = clamp(
                    activeFrame.cursorX,
                    plotLeft,
                    plotLeft + plotWidth,
                  );

                  return (
                    <g className="recharts-customized-guide-elements">
                      {activeGuideSpecs.map((guide) => {
                        const axisGroup = axisLayout.groups.find(
                          (item) => item.axisId === guide.axisId,
                        );
                        if (!axisGroup) {
                          return null;
                        }

                        const y = resolveGuideY({
                          value: guide.value,
                          axis: yAxisMap[guide.axisId],
                          domain: axisGroup.domain,
                          plotTop,
                          plotHeight,
                        });
                        if (y < plotTop - 1 || y > plotBottom + 1) {
                          return null;
                        }

                        const axisLineX =
                          plotLeft - axisGroup.sideIndex * axisWidth;
                        const textLabel = formatGuideValue(guide.value);
                        const textX = axisLineX - 1 * scale;
                        const textY = clamp(
                          y,
                          plotTop + 8 * scale,
                          plotTop + plotHeight - 6 * scale,
                        );
                        const labelWidth = Math.max(
                          18 * scale,
                          textLabel.length * 6.2 * scale + 6 * scale,
                        );
                        const labelHeight = guideLabelHeight;
                        const labelRight = textX + 1 * scale;
                        const labelX = labelRight - labelWidth;
                        const labelY = textY - labelHeight / 2;

                        return (
                          <g key={`guide-overlay-${guide.key}`}>
                            <line
                              x1={plotLeft}
                              y1={y}
                              x2={cursorX}
                              y2={y}
                              stroke={guide.color}
                              strokeDasharray={guide.dashArray}
                              strokeOpacity={0.65}
                              strokeWidth={1 * scale}
                            />
                            <circle
                              cx={cursorX}
                              cy={y}
                              r={3.2 * scale}
                              fill={guide.color}
                              stroke="#ffffff"
                              strokeWidth={1 * scale}
                            />
                            <rect
                              x={labelX}
                              y={labelY}
                              width={labelWidth}
                              height={labelHeight}
                              rx={2}
                              fill="#ffffff"
                              fillOpacity={0.95}
                            />
                            <text
                              x={textX}
                              y={textY}
                              textAnchor="end"
                              dominantBaseline="middle"
                              fontSize={guideFontSize}
                              fontWeight={600}
                              fontFamily="'IBM Plex Mono', monospace"
                              fill={guide.color}
                            >
                              {textLabel}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 z-20">
            {axisLayout.groups.map((group) => {
              const axisLineX = axisPlotLeft - group.sideIndex * axisWidth;
              const isVisible = hoveredAxisId === group.axisId;

              return (
                <div
                  key={`axis-controls-${group.axisId}`}
                  className="pointer-events-auto absolute"
                  style={{
                    left: axisLineX - axisControlZoneWidth / 2,
                    top: axisPlotTop,
                    width: axisControlZoneWidth,
                    height: axisPlotHeight,
                  }}
                  onMouseEnter={() => setHoveredAxisId(group.axisId)}
                  onMouseLeave={() =>
                    setHoveredAxisId((current) =>
                      current === group.axisId ? null : current,
                    )
                  }
                >
                  <button
                    type="button"
                    className={`absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded border border-ink/30 bg-white/95 text-ink/80 shadow-sm transition ${
                      isVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    } ${group.canIncrease ? "hover:bg-white hover:text-ink" : "cursor-not-allowed opacity-35"}`}
                    style={{
                      top: axisControlInset,
                      width: axisControlButtonSize,
                      height: axisControlButtonSize,
                    }}
                    title={`Увеличить число делений (сейчас: ${group.divisionsCount} делений, шаг: ${formatStepValue(group.step)}; Shift+клик: +3)`}
                    disabled={!group.canIncrease}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustAxisDensity(group.axisId, event.shiftKey ? 3 : 1);
                    }}
                  >
                    <ChevronUp style={{ width: 12 * scale, height: 12 * scale }} />
                  </button>
                  <div
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-ink/25 bg-white/95 px-1 py-0.5 text-center font-mono font-medium text-ink/80 shadow-sm transition select-none ${
                      isVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      fontSize: Math.max(9, Math.round(9 * scale)),
                    }}
                    title={`Делений шкалы: ${group.divisionsCount} (шаг ${formatStepValue(group.step)})`}
                  >
                    {group.divisionsCount}
                  </div>
                  <button
                    type="button"
                    className={`absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded border border-ink/30 bg-white/95 text-ink/80 shadow-sm transition ${
                      isVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    } ${group.canDecrease ? "hover:bg-white hover:text-ink" : "cursor-not-allowed opacity-35"}`}
                    style={{
                      bottom: axisControlInset,
                      width: axisControlButtonSize,
                      height: axisControlButtonSize,
                    }}
                    title={`Уменьшить число делений (сейчас: ${group.divisionsCount} делений, шаг: ${formatStepValue(group.step)}; Shift+клик: -3)`}
                    disabled={!group.canDecrease}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustAxisDensity(group.axisId, event.shiftKey ? -3 : -1);
                    }}
                  >
                    <ChevronDown style={{ width: 12 * scale, height: 12 * scale }} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 z-10">
            {axisLayout.groups.map((group) => {
              const axisLineX = axisPlotLeft - group.sideIndex * axisWidth;
              const stripLeft = axisLineX - axisStripWidth;

              return (
                <div
                  key={`axis-color-strips-${group.axisId}`}
                  className="absolute"
                  style={{
                    left: stripLeft,
                    top: axisStripTop,
                    width: axisStripWidth,
                  }}
                >
                  {group.tests.map((test, index) => (
                    <div
                      key={`axis-strip-${group.axisId}-${test.testId}`}
                      style={{
                        width: axisStripWidth,
                        height: axisStripHeight,
                        marginTop: index === 0 ? 0 : axisStripGap,
                        borderRadius: 1.5 * scale,
                        backgroundColor:
                          testColorById.get(test.testId) ?? "#0f766e",
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 border border-ink/20 bg-white px-3 py-2 text-sm font-medium text-ink/70 shadow-sm">
                <Spinner size="sm" />
                <span>Обновление графика...</span>
              </div>
            </div>
          )}
        </div>
        {prepared.tests.length > 0 && (
          <div
            className="border-t border-ink/15"
            style={{ padding: `${8 * scale}px ${12 * scale}px` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="flex flex-wrap text-ink/75"
                style={{
                  columnGap: 16 * scale,
                  rowGap: 4 * scale,
                  fontSize: 11 * scale,
                }}
              >
                {prepared.series.map((item) => {
                  const isHidden = hiddenSeriesKeys.has(item.key);
                  return (
                    <div
                      key={`legend-${item.key}`}
                      className={`flex cursor-pointer items-center px-1 py-0.5 ${
                        isHidden
                          ? 'text-ink/25'
                          : 'border border-transparent text-ink/75 hover:border-ink/15 hover:bg-white'
                      }`}
                      style={{ gap: 6 * scale, borderRadius: 3 * scale }}
                      title={`${composeSeriesName(item.testName, item.objectLabel)}${isHidden ? ' (скрыто)' : ''}`}
                      onClick={() =>
                        setHiddenSeriesKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.key)) {
                            next.delete(item.key);
                          } else {
                            next.add(item.key);
                          }
                          return next;
                        })
                      }
                      onMouseEnter={() => setHoveredLegendKey(item.key)}
                      onMouseLeave={() => setHoveredLegendKey(null)}
                    >
                      <span
                        className="inline-block rounded-sm"
                        style={{
                          width: 20 * scale,
                          height: 3 * scale,
                          backgroundColor: isHidden ? '#9ca3af' : item.color,
                        }}
                      />
                      <span className="truncate" style={{ maxWidth: 280 * scale }}>
                        {composeSeriesName(item.testName, item.objectLabel)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center" style={{ gap: 6 * scale }}>
                <button
                  type="button"
                  onClick={() => onExportPng?.()}
                  className="flex items-center justify-center rounded border border-ink/25 text-ink/70 transition hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ width: 32 * scale, height: 32 * scale }}
                  title="Экспортировать график в PNG"
                  disabled={!onExportPng}
                >
                  <ImageDown style={{ width: 16 * scale, height: 16 * scale }} />
                </button>
                <button
                  type="button"
                  onClick={() => onPrintChart?.()}
                  className="flex items-center justify-center rounded border border-ink/25 text-ink/70 transition hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ width: 32 * scale, height: 32 * scale }}
                  title="Печать графика"
                  disabled={!onPrintChart}
                >
                  <Printer style={{ width: 16 * scale, height: 16 * scale }} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void toggleFullscreen();
                  }}
                  className="flex items-center justify-center rounded border border-ink/25 text-ink/70 transition hover:bg-ink/5 hover:text-ink"
                  style={{ width: 32 * scale, height: 32 * scale }}
                  title={isExpanded ? "Свернуть график" : "Развернуть график"}
                >
                  {isExpanded ? (
                    <Minimize2 style={{ width: 16 * scale, height: 16 * scale }} />
                  ) : (
                    <Maximize2 style={{ width: 16 * scale, height: 16 * scale }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartMessage({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 border border-ink/20 bg-white text-sm text-ink/60"
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * "<параметр> / <объект>", or just the parameter when the dataset has no
 * meaningful object to name — retrospective data is one sampling point per
 * sheet and carries a blank object label (see `RETRO_OBJECT_KEY`).
 */
function composeSeriesName(testName: string, objectLabel: string): string {
  return objectLabel.trim() ? `${testName} / ${objectLabel}` : testName;
}

function getSeriesKey(testId: number, objectKey: string): string {
  return `series_${testId}__${objectKey}`;
}

function getAverageKey(testId: number): string {
  return `average_${testId}`;
}

function getObjectAverageKey(objectKey: string): string {
  return `objAvg_${objectKey}`;
}

function buildTrendlines({
  settings,
  tests,
  objects,
  sourceRows,
  displayRows,
  testColorById,
}: {
  settings: ChartTrendlineSettings;
  tests: ChartTest[];
  objects: Array<{ objectKey: string; objectLabel: string }>;
  sourceRows: ChartRow[];
  displayRows: ChartRow[];
  testColorById: Map<number, string>;
}): TrendlineMeta[] {
  if (!settings.enabled || displayRows.length === 0) {
    return [];
  }

  const fitDates = sourceRows.map((row) => String(row.date));
  const renderDates = displayRows.map((row) => String(row.date));
  const trendlines: TrendlineMeta[] = [];

  if (settings.groupBy === 'test') {
    for (const test of tests) {
      const averageKey = getAverageKey(test.testId);
      if (!rowsHaveNumericValue(sourceRows, averageKey)) {
        continue;
      }

      const computation = computeTrendline({
        key: averageKey,
        testId: test.testId,
        label: test.testName,
        color: darkenColor(testColorById.get(test.testId) ?? "#0f766e", 0.38),
        source: "average",
        fitDates,
        fitValues: sourceRows.map((row) => toNullableNumber(row[averageKey])),
        renderDates,
        renderValues: displayRows.map((row) => toNullableNumber(row[averageKey])),
        settings,
      });
      computation.values.forEach((value, index) => {
        displayRows[index][computation.dataKey] = value;
      });
      trendlines.push(makeTrendlineMeta(computation));
    }
  } else {
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      const objAvgKey = getObjectAverageKey(object.objectKey);
      const computation = computeTrendline({
        key: objAvgKey,
        testId: tests[0]?.testId ?? 0,
        label: object.objectLabel,
        color: darkenColor(
          TANK_COLORS[i % TANK_COLORS.length],
          0.38,
        ),
        source: "average",
        fitDates,
        fitValues: sourceRows.map((row) => toNullableNumber(row[objAvgKey])),
        renderDates,
        renderValues: displayRows.map((row) => toNullableNumber(row[objAvgKey])),
        settings,
      });
      computation.values.forEach((value, index) => {
        displayRows[index][computation.dataKey] = value;
      });
      trendlines.push(makeTrendlineMeta(computation));
    }
  }

  return trendlines;
}

function makeTrendlineMeta(computation: ReturnType<typeof computeTrendline>): TrendlineMeta {
  return {
    key: computation.key,
    dataKey: computation.dataKey,
    testId: computation.testId,
    label: computation.label,
    color: computation.color,
    report: {
      key: computation.key,
      testId: computation.testId,
      label: computation.label,
      color: computation.color,
      mode: computation.mode,
      source: computation.source,
      equation: computation.equation,
      rSquared: computation.rSquared,
      pointsUsed: computation.pointsUsed,
      warning: computation.warning,
    },
  };
}

function calculateAverageForSelectedObjects(
  values: ChartValuePoint[],
  testId: number,
  selectedObjects: Array<{ objectKey: string }>,
): number | null {
  if (selectedObjects.length === 0) {
    return null;
  }

  const selectedKeys = new Set(
    selectedObjects.map((object) => object.objectKey),
  );
  const numericValues = values
    .filter(
      (item) =>
        item.testId === testId &&
        selectedKeys.has(item.objectKey) &&
        typeof item.value === "number",
    )
    .map((item) => item.value as number);

  if (numericValues.length === 0) {
    return null;
  }
  return (
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
  );
}

function calculateAverageForSelectedTests(
  values: ChartValuePoint[],
  objectKey: string,
  selectedTests: ChartTest[],
): number | null {
  if (selectedTests.length === 0) {
    return null;
  }

  const selectedIds = new Set(selectedTests.map((test) => test.testId));
  const numericValues = values
    .filter(
      (item) =>
        item.objectKey === objectKey &&
        selectedIds.has(item.testId) &&
        typeof item.value === "number",
    )
    .map((item) => item.value as number);

  if (numericValues.length === 0) {
    return null;
  }
  return (
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
  );
}

function getValueRange(
  rows: ChartRow[],
  keys: string[],
): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    for (const key of keys) {
      const value = toNullableNumber(row[key]);
      if (value === null) {
        continue;
      }
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return [min, max];
}

function rowsHaveNumericValue(rows: ChartRow[], key: string): boolean {
  return rows.some((row) => toNullableNumber(row[key]) !== null);
}

function resolveAxisScale(
  rawMin: number,
  rawMax: number,
  offset: number,
): {
  domain: [number, number];
  ticks: number[];
  minorTicks: number[];
  step: number;
  divisionsCount: number;
  canIncrease: boolean;
  canDecrease: boolean;
} {
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return {
      domain: [0, 1],
      ticks: [0, 0.5, 1],
      minorTicks: [0.25, 0.75],
      step: 0.5,
      divisionsCount: 2,
      canIncrease: false,
      canDecrease: false,
    };
  }

  let min = rawMin;
  let max = rawMax;
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    min -= pad;
    max += pad;
  }

  const baseline = min >= 0 && min < max * 0.5 ? 0 : min;
  const span = Math.max(max - baseline, Number.EPSILON);

  // Generate candidate nice steps from coarse to fine
  const rawExponent = Math.floor(Math.log10(span));
  const candidateSteps: number[] = [];

  for (let exp = rawExponent + 1; exp >= rawExponent - 3; exp -= 1) {
    const base = 10 ** exp;
    for (const m of [5, 2.5, 2, 1]) {
      const step = Number.parseFloat((m * base).toPrecision(12));
      const count = span / step;
      if (step > 0 && count >= 2 && count <= 60 && !candidateSteps.includes(step)) {
        candidateSteps.push(step);
      }
    }
  }

  if (candidateSteps.length === 0) {
    candidateSteps.push(niceStep(span / 8));
  }

  // Find default step that yields around 6-10 divisions
  let defaultIndex = candidateSteps.findIndex((s) => span / s >= 6);
  if (defaultIndex === -1) {
    defaultIndex = Math.floor(candidateSteps.length / 2);
  }

  const maxLevelIndex = candidateSteps.length - 1;
  const levelIndex = clamp(defaultIndex + offset, 0, maxLevelIndex);
  const step = candidateSteps[levelIndex]!;

  const { domain, ticks, minorTicks } = buildTicksForStep(baseline, max, step);

  return {
    domain,
    ticks,
    minorTicks,
    step,
    divisionsCount: Math.max(1, ticks.length - 1),
    canIncrease: levelIndex < maxLevelIndex,
    canDecrease: levelIndex > 0,
  };
}

function buildTicksForStep(
  baseline: number,
  max: number,
  step: number,
): { domain: [number, number]; ticks: number[]; minorTicks: number[] } {
  const niceMin = Number.parseFloat((Math.floor(baseline / step) * step).toPrecision(12));
  let niceMax = Number.parseFloat((Math.ceil(max / step) * step).toPrecision(12));

  if (niceMax <= niceMin) {
    niceMax = Number.parseFloat((niceMin + step).toPrecision(12));
  }

  const count = Math.min(80, Math.max(1, Math.round((niceMax - niceMin) / step)));
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    ticks.push(Number.parseFloat((niceMin + i * step).toPrecision(12)));
  }

  const subdivisions = getSubdivisionsForStep(step);
  const minorTicks: number[] = [];
  if (subdivisions > 1) {
    const subStep = step / subdivisions;
    for (let i = 0; i < ticks.length - 1; i += 1) {
      const t0 = ticks[i];
      for (let k = 1; k < subdivisions; k += 1) {
        minorTicks.push(Number.parseFloat((t0 + k * subStep).toPrecision(12)));
      }
    }
  }

  return {
    domain: [niceMin, niceMax],
    ticks,
    minorTicks,
  };
}

function getSubdivisionsForStep(step: number): number {
  const safeStep = Math.abs(step);
  if (safeStep < Number.EPSILON) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(safeStep));
  const base = 10 ** exponent;
  const fraction = safeStep / base;

  if (Math.abs(fraction - 1) < 0.15) return 5;
  if (Math.abs(fraction - 2) < 0.15) return 4;
  if (Math.abs(fraction - 2.5) < 0.15) return 5;
  if (Math.abs(fraction - 5) < 0.15) return 5;
  return 2;
}

function formatAxisTick(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  return Number(num.toPrecision(10)).toString();
}

function formatStepValue(step: number): string {
  if (!Number.isFinite(step)) {
    return "";
  }
  return Number(Number(step).toPrecision(6)).toString();
}

function niceStep(target: number): number {
  const safeTarget = Math.max(target, Number.EPSILON);
  const exponent = Math.floor(Math.log10(safeTarget));
  const base = 10 ** exponent;
  const fraction = safeTarget / base;

  if (fraction <= 1) {
    return base;
  }
  if (fraction <= 2) {
    return 2 * base;
  }
  if (fraction <= 5) {
    return 5 * base;
  }
  return 10 * base;
}

function normalizeDomainValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number.parseFloat(value.toPrecision(12));
}

function buildGuideValueSpecs({
  guide,
  guideMode,
  series,
  trendlines,
  tests,
  axisByTest,
  testColorById,
  fallbackAxisId,
  showAverage,
  trendColorById,
}: {
  guide: HoverGuideState;
  guideMode: ChartGuideMode;
  series: SeriesMeta[];
  trendlines: TrendlineMeta[];
  tests: ChartTest[];
  axisByTest: Map<number, string>;
  testColorById: Map<number, string>;
  fallbackAxisId: string;
  showAverage: boolean;
  trendColorById: Map<number, string>;
}): GuideValueSpec[] {
  const seriesSpecs = series.flatMap((item) => {
    const value = guide.seriesByKey[item.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [];
    }

    return [
      {
        key: item.key,
        axisId: axisByTest.get(item.testId) ?? fallbackAxisId,
        value,
        color: item.color,
      } satisfies GuideValueSpec,
    ];
  });

  if (guideMode === "series" && seriesSpecs.length > 0) {
    return seriesSpecs;
  }

  const trendSpecs = trendlines.flatMap((item) => {
    const value = guide.trendByKey[item.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [];
    }

    return [
      {
        key: `trend-${item.key}`,
        axisId: axisByTest.get(item.testId) ?? fallbackAxisId,
        value,
        color: darkenColor(
          item.color ?? trendColorById.get(item.testId) ?? "#0f766e",
          0.15,
        ),
        dashArray: "6 4",
      } satisfies GuideValueSpec,
    ];
  });

  if (trendSpecs.length > 0) {
    return trendSpecs;
  }

  if (!showAverage) {
    return seriesSpecs;
  }

  const averageSpecs = tests.flatMap((test) => {
    const value = guide.averageByTest[test.testId];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [];
    }

    return [
      {
        key: `average_${test.testId}`,
        axisId: axisByTest.get(test.testId) ?? fallbackAxisId,
        value,
        color: darkenColor(testColorById.get(test.testId) ?? "#0f766e", 0.22),
        dashArray: "4 4",
      } satisfies GuideValueSpec,
    ];
  });

  return averageSpecs.length > 0 ? averageSpecs : seriesSpecs;
}

function seriesMatches(rows: ChartRow[], leftKey: string, rightKey: string): boolean {
  let comparablePoints = 0;

  for (const row of rows) {
    const leftValue = toNullableNumber(row[leftKey]);
    const rightValue = toNullableNumber(row[rightKey]);

    if (leftValue === null && rightValue === null) {
      continue;
    }
    if (leftValue === null || rightValue === null) {
      return false;
    }
    if (Math.abs(leftValue - rightValue) > 1e-9) {
      return false;
    }

    comparablePoints += 1;
  }

  return comparablePoints > 0;
}

function darkenColor(hexColor: string, ratio: number): string {
  const color = hexColor.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(color)) {
    return hexColor;
  }

  const factor = clamp(1 - ratio, 0, 1);
  const channels = [0, 2, 4].map((offset) => {
    const base = Number.parseInt(color.slice(offset, offset + 2), 16);
    const next = Math.round(base * factor);
    return next.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function toNullableNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function compressRows(
  rows: ChartRow[],
  keys: string[],
  compression: number,
): ChartRow[] {
  const bucket = Math.max(1, Math.trunc(compression));
  if (bucket <= 1 || rows.length <= 2) {
    return [...rows];
  }

  const compressed: ChartRow[] = [];
  for (let index = 0; index < rows.length; index += bucket) {
    const group = rows.slice(index, index + bucket);
    const representativeDate = String(
      group[Math.floor(group.length / 2)]?.date ?? group[0]?.date ?? "",
    );

    const row: ChartRow = { date: representativeDate };
    for (const key of keys) {
      const values = group
        .map((point) => toNullableNumber(point[key]))
        .filter((value): value is number => value !== null);
      row[key] = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    }

    compressed.push(row);
  }

  return compressed;
}

function applyApproximation(
  values: Array<number | null>,
  mode: ChartOptimizationSettings["lineApproximation"],
  options: ApproximationOptions,
): Array<number | null> {
  if (mode === "raw") {
    return values;
  }
  if (mode === "moving_average") {
    return movingAverage(values, Math.max(2, options.movingAverageWindow));
  }
  return ema(values, clamp(options.emaAlpha, 0.05, 0.95));
}

function movingAverage(
  values: Array<number | null>,
  window: number,
): Array<number | null> {
  const result: Array<number | null> = [];
  for (let index = 0; index < values.length; index += 1) {
    const from = Math.max(0, index - window + 1);
    const slice = values
      .slice(from, index + 1)
      .filter((value): value is number => value !== null);
    result.push(
      slice.length
        ? slice.reduce((sum, value) => sum + value, 0) / slice.length
        : null,
    );
  }
  return result;
}

function ema(
  values: Array<number | null>,
  alpha: number,
): Array<number | null> {
  const result: Array<number | null> = [];
  let previous: number | null = null;

  for (const value of values) {
    if (value === null) {
      result.push(previous);
      continue;
    }

    if (previous === null) {
      previous = value;
    } else {
      previous = alpha * value + (1 - alpha) * previous;
    }

    result.push(previous);
  }

  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatGuideValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 1 : absolute >= 10 ? 2 : 3;
  return Number(value.toFixed(digits)).toString();
}

function formatXAxisDate(value: string): string {
  try {
    return format(parseISO(value), "dd.MM.yy");
  } catch {
    return value;
  }
}

function formatGuideDate(value: string): string {
  try {
    return format(parseISO(value), "dd.MM.yy");
  } catch {
    return value;
  }
}

function renderVerticalGuideLabel(props: GuideLabelProps, text: string) {
  const viewBox = props?.viewBox ?? {};
  const lineX =
    typeof viewBox.x === "number"
      ? viewBox.x
      : typeof props?.x === "number"
        ? props.x
        : 0;
  const lineY =
    typeof viewBox.y === "number"
      ? viewBox.y
      : typeof props?.y === "number"
        ? props.y
        : 0;
  const lineHeight = typeof viewBox.height === "number" ? viewBox.height : 0;
  const lineWidth = typeof viewBox.width === "number" ? viewBox.width : 0;

  const paddingX = 6;
  const height = 18;
  const width = Math.max(52, text.length * 6.6 + paddingX * 2);
  const minX = lineX - lineWidth / 2 + 2;
  const maxX = lineX + lineWidth / 2 - width - 2;
  const rectX = clamp(
    lineX - width / 2,
    Math.min(minX, maxX),
    Math.max(minX, maxX),
  );
  const rectY = lineY + lineHeight + 6;

  return (
    <g>
      <rect
        x={rectX}
        y={rectY}
        width={width}
        height={height}
        rx={2}
        fill="#ffffff"
        fillOpacity={1}
        stroke="#dc2626"
        strokeWidth={1}
      />
      <text
        x={rectX + width / 2}
        y={rectY + 12.2}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fontFamily="'IBM Plex Mono', monospace"
        fill="#b91c1c"
      >
        {text}
      </text>
    </g>
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveGuideY({
  value,
  axis,
  domain,
  plotTop,
  plotHeight,
}: {
  value: number;
  axis?: { scale?: unknown };
  domain: [number, number];
  plotTop: number;
  plotHeight: number;
}): number {
  const scale = axis?.scale;
  if (typeof scale === "function") {
    const scaled = scale(value);
    if (typeof scaled === "number" && Number.isFinite(scaled)) {
      return scaled;
    }
  }

  return valueToPixel(value, domain, plotTop, plotHeight);
}

function valueToPixel(
  value: number,
  domain: [number, number],
  plotTop: number,
  plotHeight: number,
): number {
  const [min, max] = domain;
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return plotTop + plotHeight / 2;
  }
  const ratio = (value - min) / (max - min);
  const clampedRatio = clamp(ratio, 0, 1);
  return plotTop + (1 - clampedRatio) * plotHeight;
}
