'use client';

import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import type { RetroFileDetails } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface RetroFileDetailsPanelProps {
  details: RetroFileDetails | null;
}

/**
 * Retro-mode counterpart of `FileDetails` — same slot in `Sidebar`, same
 * visual language, different content: a retro "file" (really one sheet of
 * a workbook) covers a period instead of a single calendar date, and
 * carries standalone facts (working volume, design temperature, ...)
 * instead of measurements.
 */
export function RetroFileDetailsPanel({ details }: RetroFileDetailsPanelProps) {
  if (!details) {
    return (
      <div className="border border-dashed border-ink/30 p-3 text-xs text-ink/60">
        Выберите файл для просмотра информации.
      </div>
    );
  }

  return (
    <div className="space-y-2 border border-ink/20 bg-white p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{details.title || details.filename}</p>
          <p className="truncate text-ink/60">{details.filename}</p>
        </div>
        <FileStatusBadge status={details.status} />
      </div>

      <div className="border border-ink/15 p-1.5 text-[11px]">
        <p className="text-ink/55">Предупреждений</p>
        <p className="font-semibold text-ink">{details.warnings.length}</p>
      </div>

      {details.facts.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-auto border border-ink/15 p-2 text-[11px]">
          <p className="font-semibold uppercase tracking-wide text-ink/45">Паспортные данные</p>
          {details.facts.map((fact) => (
            <p key={fact.label} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-ink/60">{fact.label}</span>
              <span className="shrink-0 font-mono text-ink/80">
                {fact.value !== null ? formatNumber(fact.value, 2) : fact.rawValue || '—'}
              </span>
            </p>
          ))}
        </div>
      )}

      {details.warnings.length > 0 ? (
        <div className="max-h-40 overflow-auto border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
          {details.warnings.map((warning, index) => (
            <p key={`${warning}-${index}`}>• {warning}</p>
          ))}
        </div>
      ) : (
        <div className="border border-leaf/30 bg-leaf/10 p-2 text-[11px] text-leaf">Замечаний нет</div>
      )}
    </div>
  );
}
