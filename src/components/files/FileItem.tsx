'use client';

import clsx from 'clsx';

import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import type { FileInfo } from '@/lib/types';

interface FileItemProps {
  file: FileInfo;
  selected: boolean;
  onClick: () => void;
}

export function FileItem({ file, selected, onClick }: FileItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex h-10 w-full items-center justify-between gap-2 border px-2 text-left transition',
        selected ? 'border-ink bg-ink/5' : 'border-ink/10 bg-white hover:border-ink/30'
      )}
    >
      <p className="line-clamp-1 text-[12px] font-semibold text-ink">{file.filename}</p>
      <FileStatusBadge status={file.status} />
    </button>
  );
}
