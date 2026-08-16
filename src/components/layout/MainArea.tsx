'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { StatsSummary, type EfficiencyGroup } from '@/components/charts/StatsSummary';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { PeriodControl } from '@/components/filters/PeriodControl';
import { StatusBar } from '@/components/layout/StatusBar';
import type {
  ChartDataset,
  ChartGuideMode,
  ChartHoverSnapshot,
  ChartOptimizationSettings,
  ChartTrendlineReport,
  ChartTrendlineSettings,
  DateRange,
  OverlayPeriod,
  ParameterLink,
  ParseProgress
} from '@/lib/types';

interface MainAreaProps {
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  parameterLinks: ParameterLink[];
  availableDates: string[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  /**
   * Period comparison lives in the same control as the date range — see
   * `PeriodControl`. Omit all four to drop the mode switcher and offer only
   * a single date range (daily mode does this).
   */
  periods?: OverlayPeriod[];
  onPeriodsChange?: (periods: OverlayPeriod[]) => void;
  overlayEnabled?: boolean;
  onOverlayEnabledChange?: (enabled: boolean) => void;
  chartData: ChartDataset | null;
  isChartLoading: boolean;
  showAverage: boolean;
  guideMode: ChartGuideMode;
  chartOptimization: ChartOptimizationSettings;
  chartTrendline: ChartTrendlineSettings;
  parseProgress: ParseProgress | null;
  statusMessage: string | null;
  onExportExcel: () => void;
  onExportPng: () => void;
  onPrintChart: () => void;
  /** Set when period overlay is active — see src/lib/period-overlay.ts. */
  xTickFormatter?: (value: string) => string;
  xMinTickGap?: number;
  dateFormatter?: (value: string) => string;
  efficiencyGroups?: EfficiencyGroup[];
  extraActions?: ReactNode;
}

export function MainArea({
  selectedTestIds,
  selectedObjectKeys,
  parameterLinks,
  availableDates,
  dateRange,
  onDateRangeChange,
  periods,
  onPeriodsChange,
  overlayEnabled,
  onOverlayEnabledChange,
  chartData,
  isChartLoading,
  showAverage,
  guideMode,
  chartOptimization,
  chartTrendline,
  parseProgress,
  statusMessage,
  onExportExcel,
  onExportPng,
  onPrintChart,
  xTickFormatter,
  xMinTickGap,
  dateFormatter,
  efficiencyGroups,
  extraActions
}: MainAreaProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const previewLineRef = useRef<HTMLDivElement | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const [chartHeight, setChartHeight] = useState(360);
  const [uiScale, setUiScale] = useState(1);
  const [hoverSnapshot, setHoverSnapshot] = useState<ChartHoverSnapshot | null>(null);
  const [trendlineReports, setTrendlineReports] = useState<ChartTrendlineReport[]>([]);
  const [resizeStart, setResizeStart] = useState<{ y: number; height: number; min: number; max: number } | null>(
    null
  );

  function movePreviewLine(height: number) {
    const line = previewLineRef.current;
    if (!line) {
      return;
    }
    line.style.transform = `translateY(${Math.round(height)}px)`;
  }

  function getHeightLimits() {
    const rootHeight = rootRef.current?.clientHeight ?? 900;
    return {
      min: Math.round(220 * uiScale),
      max: Math.max(Math.round(300 * uiScale), rootHeight - Math.round(260 * uiScale))
    };
  }

  useEffect(() => {
    if (!chartData) {
      setHoverSnapshot(null);
      setTrendlineReports([]);
    }
  }, [chartData]);

  useEffect(() => {
    const readScale = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
      const next = Number.parseFloat(raw);
      setUiScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    readScale();
    const observer = new MutationObserver(readScale);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!resizeStart) {
      return;
    }
    const activeResize = resizeStart;

    pendingHeightRef.current = activeResize.height;
    movePreviewLine(activeResize.height);

    function onMove(event: MouseEvent) {
      const draft = activeResize.height + (event.clientY - activeResize.y);
      const next = Math.min(activeResize.max, Math.max(activeResize.min, draft));
      pendingHeightRef.current = next;
      movePreviewLine(next);
    }

    function onUp() {
      const finalHeight = pendingHeightRef.current;
      if (typeof finalHeight === 'number') {
        setChartHeight(finalHeight);
      }
      pendingHeightRef.current = null;
      setResizeStart(null);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizeStart]);

  return (
    <main ref={rootRef} className="flex h-full min-w-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        <div className="relative">
          {resizeStart && (
            <div
              ref={previewLineRef}
              className="pointer-events-none absolute left-0 right-0 z-20 h-[2px] bg-ink/60"
              style={{ top: 0 }}
            />
          )}

          <TimeSeriesChart
            data={chartData}
            isLoading={isChartLoading}
            selectedTestIds={selectedTestIds}
            selectedObjectKeys={selectedObjectKeys}
            showAverage={showAverage}
            guideMode={guideMode}
            optimization={chartOptimization}
            trendline={chartTrendline}
            height={Math.round(chartHeight * uiScale)}
            uiScale={uiScale}
            onHoverChange={setHoverSnapshot}
            onTrendlinesChange={setTrendlineReports}
            onExportPng={onExportPng}
            onPrintChart={onPrintChart}
            xTickFormatter={xTickFormatter}
            xMinTickGap={xMinTickGap}
          />

          <div
            className="h-2 cursor-row-resize"
            onMouseDown={(event) => {
              const limits = getHeightLimits();
              setResizeStart({ y: event.clientY, height: chartHeight, min: limits.min, max: limits.max });
            }}
            title="Изменить высоту графика"
          />
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <PeriodControl
              value={dateRange}
              onChange={onDateRangeChange}
              availableDates={availableDates}
              periods={periods}
              onPeriodsChange={onPeriodsChange}
              overlayEnabled={overlayEnabled}
              onOverlayEnabledChange={onOverlayEnabledChange}
            />
          </div>
          {extraActions}
        </div>

        <StatsSummary
          data={chartData}
          hoverSnapshot={hoverSnapshot}
          selectedTestIds={selectedTestIds}
          selectedObjectKeys={selectedObjectKeys}
          parameterLinks={parameterLinks}
          guideMode={guideMode}
          trendlineReports={trendlineReports}
          trendlineSettings={chartTrendline}
          onExportExcel={onExportExcel}
          dateFormatter={dateFormatter}
          efficiencyGroups={efficiencyGroups}
        />
      </div>
      <StatusBar progress={parseProgress} message={statusMessage} />
    </main>
  );
}
