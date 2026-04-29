'use client';

import type { ChartGuideMode } from '@/lib/types';

interface ChartControlsProps {
  showAverage: boolean;
  guideMode: ChartGuideMode;
  onToggleAverage: (next: boolean) => void;
  onGuideModeChange: (next: ChartGuideMode) => void;
}

export function ChartControls({
  showAverage,
  onToggleAverage
}: ChartControlsProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={showAverage}
          onChange={(event) => onToggleAverage(event.target.checked)}
          className="accent-ink"
        />
        Показать среднюю линию
      </label>
    </div>
  );
}

export function AnalysisModeControl({
  showAverage,
  guideMode,
  onGuideModeChange
}: Pick<ChartControlsProps, 'showAverage' | 'guideMode' | 'onGuideModeChange'>) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <button
        type="button"
        onClick={() => onGuideModeChange('series')}
        className={`h-8 border px-2 text-xs font-medium transition ${
          guideMode === 'series'
            ? 'border-ink bg-ink text-white'
            : 'border-ink/25 bg-white text-ink/75 hover:border-ink/45 hover:text-ink'
        }`}
      >
        Графики
      </button>
      <button
        type="button"
        onClick={() => onGuideModeChange('average')}
        disabled={!showAverage}
        title={showAverage ? 'Анализировать по средним значениям' : 'Сначала включите среднюю линию'}
        className={`h-8 border px-2 text-xs font-medium transition ${
          guideMode === 'average'
            ? 'border-ink bg-ink text-white'
            : 'border-ink/25 bg-white text-ink/75 hover:border-ink/45 hover:text-ink'
        } disabled:cursor-not-allowed disabled:border-ink/15 disabled:bg-white disabled:text-ink/35`}
      >
        Средние
      </button>
    </div>
  );
}
