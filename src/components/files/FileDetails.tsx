'use client';

import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import type { FileDetails as FileDetailsType } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface FileDetailsProps {
  details: FileDetailsType | null;
}

export function FileDetails({ details }: FileDetailsProps) {
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
          <p className="truncate font-semibold text-ink">{details.filename}</p>
          <p className="text-ink/60">{formatDate(details.date)}</p>
        </div>
        <FileStatusBadge status={details.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="border border-ink/15 p-1.5">
          <p className="text-ink/55">Объектов</p>
          <p className="font-semibold text-ink">{details.objectCount}</p>
        </div>
        <div className="border border-ink/15 p-1.5">
          <p className="text-ink/55">Предупреждений</p>
          <p className="font-semibold text-ink">{details.warnings.length}</p>
        </div>
      </div>

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
