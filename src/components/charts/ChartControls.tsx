'use client';

interface ChartControlsProps {
  showAverage: boolean;
  onToggleAverage: (next: boolean) => void;
}

export function ChartControls({ showAverage, onToggleAverage }: ChartControlsProps) {
  return (
    <label className="flex items-center gap-2 border border-ink/30 bg-white px-3 py-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={showAverage}
        onChange={(event) => onToggleAverage(event.target.checked)}
        className="accent-ink"
      />
      Показать среднюю линию
    </label>
  );
}
