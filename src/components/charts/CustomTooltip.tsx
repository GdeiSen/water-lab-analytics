'use client';

import type { TooltipProps } from 'recharts';

import { formatDate, formatNumber } from '@/lib/utils';

export function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="border border-ink/30 bg-white p-2">
      <p className="mb-1 text-xs font-semibold text-ink/70">{formatDate(String(label))}</p>
      <div className="space-y-1 text-xs">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-2 text-ink">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color ?? '#0B7A75' }}
            />
            {entry.name}: {formatNumber(entry.value as number | null, 3)}
          </p>
        ))}
      </div>
    </div>
  );
}
