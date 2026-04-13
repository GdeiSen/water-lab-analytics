'use client';

import { useEffect, useRef, useState } from 'react';

import { StatsSummary } from '@/components/charts/StatsSummary';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import { StatusBar } from '@/components/layout/StatusBar';
import type {
  ChartDataset,
  ChartGuideMode,
  ChartHoverSnapshot,
  ChartOptimizationSettings,
  DateRange,
  ParseProgress
} from '@/lib/types';

interface MainAreaProps {
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  availableDates: string[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  chartData: ChartDataset | null;
  showAverage: boolean;
  guideMode: ChartGuideMode;
  chartOptimization: ChartOptimizationSettings;
  parseProgress: ParseProgress | null;
  statusMessage: string | null;
  onExportExcel: () => void;
  onExportPng: () => void;
  onPrintChart: () => void;
}

export function MainArea({
  selectedTestIds,
  selectedObjectKeys,
  availableDates,
  dateRange,
  onDateRangeChange,
  chartData,
  showAverage,
  guideMode,
  chartOptimization,
  parseProgress,
  statusMessage,
  onExportExcel,
  onExportPng,
  onPrintChart
}: MainAreaProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const previewLineRef = useRef<HTMLDivElement | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const [chartHeight, setChartHeight] = useState(360);
  const [hoverSnapshot, setHoverSnapshot] = useState<ChartHoverSnapshot | null>(null);
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
    return { min: 220, max: Math.max(300, rootHeight - 260) };
  }

  useEffect(() => {
    if (!chartData) {
      setHoverSnapshot(null);
    }
  }, [chartData]);

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
            selectedTestIds={selectedTestIds}
            selectedObjectKeys={selectedObjectKeys}
            showAverage={showAverage}
            guideMode={guideMode}
            optimization={chartOptimization}
            height={chartHeight}
            onHoverChange={setHoverSnapshot}
            onExportPng={onExportPng}
            onPrintChart={onPrintChart}
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

        <DateRangePicker value={dateRange} onChange={onDateRangeChange} availableDates={availableDates} />

        <StatsSummary
          data={chartData}
          hoverSnapshot={hoverSnapshot}
          selectedTestIds={selectedTestIds}
          selectedObjectKeys={selectedObjectKeys}
          onExportExcel={onExportExcel}
        />
      </div>
      <StatusBar progress={parseProgress} message={statusMessage} />
    </main>
  );
}
