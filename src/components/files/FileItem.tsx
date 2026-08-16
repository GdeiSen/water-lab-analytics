'use client';

import clsx from 'clsx';

import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import type { FileListEntry } from '@/lib/types';

interface FileItemProps {
  file: FileListEntry;
  selected: boolean;
  onClick: () => void;
}

export function FileItem({ file, selected, onClick }: FileItemProps) {
  const primaryLabel = file.sourceLabel && file.sourceLabel.trim().length > 0 ? file.sourceLabel : file.filename;
  const showSecondaryLine = primaryLabel !== file.filename;

  return (
    <button
      type="button"
      onClick={onClick}
      title={file.filename}
      className={clsx(
        'w-full border px-2 py-1.5 text-left transition',
        selected ? 'border-ink bg-ink/5' : 'border-ink/10 bg-white hover:border-ink/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-1 text-[12px] font-semibold text-ink">{primaryLabel}</p>
          {showSecondaryLine && <p className="line-clamp-1 text-[10px] text-ink/50">{file.filename}</p>}
        </div>
        <FileStatusBadge status={file.status} />
      </div>
    </button>
  );
}
