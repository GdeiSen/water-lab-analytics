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
  guideMode,
  onToggleAverage,
  onGuideModeChange
}: ChartControlsProps) {
  return (
    <div className="space-y-2 border border-ink/20 bg-[#f7f8fa] p-2">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={showAverage}
          onChange={(event) => onToggleAverage(event.target.checked)}
          className="accent-ink"
        />
        Показать среднюю линию
      </label>

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-ink/55">
          Вспомогательные линии
        </p>
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
            По графикам
          </button>
          <button
            type="button"
            onClick={() => onGuideModeChange('average')}
            disabled={!showAverage}
            title={
              showAverage
                ? 'Показывать линии по средним значениям'
                : 'Сначала включите среднюю линию'
            }
            className={`h-8 border px-2 text-xs font-medium transition ${
              guideMode === 'average'
                ? 'border-ink bg-ink text-white'
                : 'border-ink/25 bg-white text-ink/75 hover:border-ink/45 hover:text-ink'
            } disabled:cursor-not-allowed disabled:border-ink/15 disabled:bg-white disabled:text-ink/35`}
          >
            По средним
          </button>
        </div>
      </div>
    </div>
  );
}
