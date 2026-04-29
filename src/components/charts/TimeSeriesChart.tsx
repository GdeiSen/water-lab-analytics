"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ImageDown,
  Maximize2,
  Minimize2,
  Printer,
} from "lucide-react";
import {
  CartesianGrid,
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
import type {
  ChartDataset,
  ChartGuideMode,
  ChartHoverSnapshot,
  ChartHoverTestStats,
  ChartOptimizationSettings,
  ChartValuePoint,
  ChartTest,
} from "@/lib/types";
import { TANK_COLORS } from "@/lib/utils";

interface TimeSeriesChartProps {
  data: ChartDataset | null;
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  showAverage: boolean;
  guideMode: ChartGuideMode;
  optimization: ChartOptimizationSettings;
  height: number;
  uiScale: number;
  onHoverChange?: (snapshot: ChartHoverSnapshot | null) => void;
  onExportPng?: () => void;
  onPrintChart?: () => void;
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

interface PreparedChart {
  rows: ChartRow[];
  tests: ChartTest[];
  series: SeriesMeta[];
}

interface AxisGroup {
  axisId: string;
  orientation: "left";
  sideIndex: number;
  domain: [number, number];
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

interface AxisLabelProps {
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
}

interface GuideValueSpec {
  key: string;
  axisId: string;
  value: number;
  color: string;
  dashArray?: string;
}

const AXIS_WIDTH = 36;
const AXIS_STROKE = "#6b7280";
const AXIS_TO_PLOT_GAP = 10;
const DEFAULT_AXIS_TICK_COUNT = 7;
const MIN_AXIS_TICK_COUNT = 3;
const MAX_AXIS_TICK_COUNT = 14;
const AXIS_CONTROL_ZONE_WIDTH = 24;
const AXIS_CONTROL_BUTTON_SIZE = 18;
const AXIS_CONTROL_VERTICAL_INSET = 2;

export function TimeSeriesChart({
  data,
  selectedTestIds,
  selectedObjectKeys,
  showAverage,
  guideMode,
  optimization,
  height,
  uiScale,
  onHoverChange,
  onExportPng,
  onPrintChart,
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const [hoverGuide, setHoverGuide] = useState<HoverGuideState | null>(null);
  const [lockedGuide, setLockedGuide] = useState<HoverGuideState | null>(null);
  const [hoverFrame, setHoverFrame] = useState<GuideFrame | null>(null);
  const [lockedFrame, setLockedFrame] = useState<GuideFrame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [hoveredAxisId, setHoveredAxisId] = useState<string | null>(null);
  const [axisTickCounts, setAxisTickCounts] = useState<Record<string, number>>(
    {},
  );

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

  const prepared = useMemo(() => {
    if (!data || selectedTests.length === 0) {
      return {
        rows: [],
        tests: selectedTests,
        series: [],
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
          testColorById.get(test.testId) ??
          TANK_COLORS[(testIndex + objectIndex) % TANK_COLORS.length],
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
      const averageMap = new Map(
        point.averages.map((item) => [getAverageKey(item.testId), item.value]),
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
            : (averageMap.get(getAverageKey(test.testId)) ?? null);
      }

      return row;
    });

    const effective = resolveEffectiveOptimization(
      optimization,
      baseRows.length,
    );
    const seriesKeys = series.map((item) => item.key);
    const compressed = compressRows(
      baseRows,
      [...seriesKeys, ...averageKeys],
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

    return {
      rows: compressed,
      tests: selectedTests,
      series,
    } satisfies PreparedChart;
  }, [data, optimization, selectedObjects, selectedTests, testColorById]);

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

  const visibleAverageTestIds = useMemo(() => {
    const visible = new Set<number>();

    for (const test of prepared.tests) {
      const averageKey = getAverageKey(test.testId);
      const seriesKeys = seriesByTest.get(test.testId) ?? [];
      const duplicatesSeries = seriesKeys.some((seriesKey) =>
        seriesMatches(prepared.rows, averageKey, seriesKey),
      );

      if (!duplicatesSeries) {
        visible.add(test.testId);
      }
    }

    return visible;
  }, [prepared.rows, prepared.tests, seriesByTest]);

  const axisLayout = useMemo(() => {
    const grouped = new Map<
      string,
      {
        domain: [number, number];
        tests: ChartTest[];
      }
    >();

    for (const test of prepared.tests) {
      const keys = [...(seriesByTest.get(test.testId) ?? [])];
      if (showAverage && visibleAverageTestIds.has(test.testId)) {
        keys.push(getAverageKey(test.testId));
      }
      if (keys.length === 0) {
        continue;
      }

      const range = getValueRange(prepared.rows, keys);
      if (!range) {
        continue;
      }
      const domain = buildNiceDomain(range[0], range[1]);
      const signature = `${normalizeDomainValue(domain[0])}:${normalizeDomainValue(domain[1])}`;

      const bucket = grouped.get(signature);
      if (!bucket) {
        grouped.set(signature, { domain, tests: [test] });
        continue;
      }
      bucket.tests.push(test);
    }

    const groups = Array.from(grouped.values()).map((entry, index) => ({
      axisId: `axis_group_${index}`,
      orientation: "left",
      sideIndex: index,
      domain: entry.domain,
      tests: entry.tests,
    })) as AxisGroup[];

    if (groups.length === 0 && prepared.tests.length > 0) {
      groups.push({
        axisId: "axis_group_0",
        orientation: "left",
        sideIndex: 0,
        domain: [0, 1],
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
    prepared.rows,
    prepared.tests,
    seriesByTest,
    showAverage,
    visibleAverageTestIds,
  ]);

  useEffect(() => {
    const availableAxisIds = new Set(
      axisLayout.groups.map((group) => group.axisId),
    );

    setAxisTickCounts((previous) => {
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

  if (
    !data ||
    prepared.rows.length === 0 ||
    (prepared.series.length === 0 && !showAverage)
  ) {
    return (
      <div
        className="flex items-center justify-center border border-ink/20 bg-white text-sm text-ink/60"
        style={{ height }}
      >
        Нет данных для отображения графика.
      </div>
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
        series: prepared.series,
        tests: prepared.tests,
        axisByTest: axisLayout.axisByTest,
        testColorById,
        fallbackAxisId,
        showAverage,
      })
    : [];
  const lockedGuideSpecs = lockedGuide
    ? buildGuideValueSpecs({
        guide: lockedGuide,
        guideMode,
        series: prepared.series,
        tests: prepared.tests,
        axisByTest: axisLayout.axisByTest,
        testColorById,
        fallbackAxisId,
        showAverage,
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

  const adjustAxisTickDensity = (axisId: string, delta: number) => {
    setAxisTickCounts((previous) => {
      const current = previous[axisId] ?? DEFAULT_AXIS_TICK_COUNT;
      const next = clamp(
        Math.round(current + delta),
        MIN_AXIS_TICK_COUNT,
        MAX_AXIS_TICK_COUNT,
      );

      if (next === current) {
        return previous;
      }

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
      const keys = seriesByTest.get(test.testId) ?? [];
      const values = keys
        .map((key) => toNullableNumber(row[key]))
        .filter((value): value is number => value !== null);
      const averageValue =
        toNullableNumber(row[getAverageKey(test.testId)]) ??
        (values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null);

      return {
        testId: test.testId,
        min: null,
        max: null,
        average: null,
        median: null,
        stdDev: null,
        cursorValue: averageValue,
      } satisfies ChartHoverTestStats;
    });

    const cursorByTest: Record<number, number | null> = {};
    for (const item of statsByTest) {
      cursorByTest[item.testId] = item.cursorValue;
    }

    const seriesByKey: Record<string, number | null> = {};
    for (const series of prepared.series) {
      seriesByKey[series.key] = toNullableNumber(row[series.key]);
    }

    return {
      guide: {
        date: String(row.date),
        averageByTest: cursorByTest,
        seriesByKey,
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
              <CartesianGrid strokeDasharray="3 3" stroke="#d0d7df" />
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                minTickGap={28 * scale}
                tickFormatter={(value) => formatXAxisDate(String(value))}
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
                  tickCount={
                    axisTickCounts[group.axisId] ?? DEFAULT_AXIS_TICK_COUNT
                  }
                  allowDataOverflow
                  label={(props: AxisLabelProps) =>
                    renderAxisColorStrips(props, group.tests, testColorById, scale)
                  }
                />
              ))}

              {prepared.series.map((series) => (
                <Line
                  key={series.key}
                  yAxisId={
                    axisLayout.axisByTest.get(series.testId) ?? fallbackAxisId
                  }
                  type="monotone"
                  dataKey={series.key}
                  name={`${series.testName} / ${series.objectLabel}`}
                  stroke={series.color}
                  dot={false}
                  isAnimationActive
                  strokeWidth={1.8 * scale}
                  connectNulls
                />
              ))}

              {showAverage &&
                prepared.tests.map((test) => (
                  visibleAverageTestIds.has(test.testId) ? (
                    <Line
                      key={`avg-${test.testId}`}
                      yAxisId={
                        axisLayout.axisByTest.get(test.testId) ?? fallbackAxisId
                      }
                      type="monotone"
                      dataKey={getAverageKey(test.testId)}
                      name={`${test.testName} (среднее)`}
                      stroke={darkenColor(
                        testColorById.get(test.testId) ?? "#0f766e",
                        0.22,
                      )}
                      strokeDasharray="6 4"
                      dot={false}
                      isAnimationActive
                      strokeWidth={2.2 * scale}
                      connectNulls
                    />
                  ) : null
                ))}

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
                      formatGuideDate(activeGuide.date),
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

              <Customized
                component={(chartProps: unknown) => {
                  if (!activeGuide || !activeFrame) {
                    return null;
                  }

                  const chartState = chartProps as {
                    yAxisMap?: Record<
                      string,
                      { scale?: (value: number) => number }
                    >;
                    offset?: { top?: number; height?: number };
                  };
                  const yAxisMap = chartState?.yAxisMap ?? {};
                  const offsetTop = chartState?.offset?.top;
                  const offsetHeight = chartState?.offset?.height;
                  const plotTop =
                    typeof offsetTop === "number"
                      ? offsetTop
                      : activeFrame.plotTop;
                  const plotHeight =
                    typeof offsetHeight === "number"
                      ? offsetHeight
                      : activeFrame.plotHeight;
                  const leftMostAxisX =
                    activeFrame.plotLeft -
                    (axisLayout.leftCount - 1) * axisWidth;

                  return (
                    <g>
                      {activeGuideSpecs.map((guide) => {
                        const axisGroup = axisLayout.groups.find(
                          (item) => item.axisId === guide.axisId,
                        );
                        if (!axisGroup) {
                          return null;
                        }

                        const scaledY = yAxisMap?.[guide.axisId]?.scale?.(
                          guide.value,
                        );
                        const y =
                          typeof scaledY === "number" &&
                          Number.isFinite(scaledY)
                            ? scaledY
                            : valueToPixel(
                                guide.value,
                                axisGroup.domain,
                                plotTop,
                                plotHeight,
                              );

                        const axisLineX =
                          activeFrame.plotLeft -
                          axisGroup.sideIndex * axisWidth;
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
                              x1={leftMostAxisX}
                              y1={y}
                              x2={activeFrame.cursorX}
                              y2={y}
                              stroke={guide.color}
                              strokeDasharray={guide.dashArray}
                              strokeOpacity={0.65}
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
              const canIncrease =
                (axisTickCounts[group.axisId] ?? DEFAULT_AXIS_TICK_COUNT) <
                MAX_AXIS_TICK_COUNT;
              const canDecrease =
                (axisTickCounts[group.axisId] ?? DEFAULT_AXIS_TICK_COUNT) >
                MIN_AXIS_TICK_COUNT;

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
                    } ${canIncrease ? "hover:bg-white hover:text-ink" : "cursor-not-allowed opacity-35"}`}
                    style={{
                      top: axisControlInset,
                      width: axisControlButtonSize,
                      height: axisControlButtonSize,
                    }}
                    title="Increase scale granularity"
                    disabled={!canIncrease}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustAxisTickDensity(group.axisId, 1);
                    }}
                  >
                    <ChevronUp style={{ width: 12 * scale, height: 12 * scale }} />
                  </button>
                  <button
                    type="button"
                    className={`absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded border border-ink/30 bg-white/95 text-ink/80 shadow-sm transition ${
                      isVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    } ${canDecrease ? "hover:bg-white hover:text-ink" : "cursor-not-allowed opacity-35"}`}
                    style={{
                      bottom: axisControlInset,
                      width: axisControlButtonSize,
                      height: axisControlButtonSize,
                    }}
                    title="Decrease scale granularity"
                    disabled={!canDecrease}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustAxisTickDensity(group.axisId, -1);
                    }}
                  >
                    <ChevronDown style={{ width: 12 * scale, height: 12 * scale }} />
                  </button>
                </div>
              );
            })}
          </div>
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
                {prepared.tests.map((test) => (
                  <div
                    key={`legend-${test.testId}`}
                    className="flex items-center"
                    style={{ gap: 6 * scale }}
                  >
                    <span
                      className="inline-block rounded-sm"
                      style={{
                        width: 20 * scale,
                        height: 3 * scale,
                        backgroundColor:
                          testColorById.get(test.testId) ?? "#0f766e",
                      }}
                    />
                    <span className="truncate" style={{ maxWidth: 280 * scale }}>
                      {test.testName}
                    </span>
                  </div>
                ))}
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

function getSeriesKey(testId: number, objectKey: string): string {
  return `series_${testId}__${objectKey}`;
}

function getAverageKey(testId: number): string {
  return `average_${testId}`;
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

function buildNiceDomain(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    min -= pad;
    max += pad;
  }

  const baseline = min >= 0 ? 0 : min;
  const span = Math.max(max - baseline, Number.EPSILON);
  const step = niceStep(span / 6);
  const niceMin = Math.floor(baseline / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  if (niceMax <= niceMin) {
    return [niceMin, niceMin + step];
  }
  return [niceMin, niceMax];
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
  tests,
  axisByTest,
  testColorById,
  fallbackAxisId,
  showAverage,
}: {
  guide: HoverGuideState;
  guideMode: ChartGuideMode;
  series: SeriesMeta[];
  tests: ChartTest[];
  axisByTest: Map<number, string>;
  testColorById: Map<number, string>;
  fallbackAxisId: string;
  showAverage: boolean;
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

function renderAxisColorStrips(
  props: AxisLabelProps,
  tests: ChartTest[],
  testColorById: Map<number, string>,
  scale = 1,
) {
  if (tests.length === 0) {
    return null;
  }

  const viewBox = props?.viewBox ?? {};
  const x = typeof viewBox.x === "number" ? viewBox.x : 0;
  const y = typeof viewBox.y === "number" ? viewBox.y : 0;
  const width = typeof viewBox.width === "number" ? viewBox.width : 0;
  const height = typeof viewBox.height === "number" ? viewBox.height : 0;

  const stripWidth = 26 * scale;
  const stripHeight = 3 * scale;
  const gap = 2.5 * scale;
  const stripX = x + width - stripWidth;
  const startY = y + height + 6 * scale;

  return (
    <g>
      {tests.map((test, index) => (
        <rect
          key={`axis-strip-${test.testId}`}
          x={stripX}
          y={startY + index * (stripHeight + gap)}
          width={stripWidth}
          height={stripHeight}
          rx={1.5}
          fill={testColorById.get(test.testId) ?? "#0f766e"}
        />
      ))}
    </g>
  );
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
