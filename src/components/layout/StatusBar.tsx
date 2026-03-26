'use client';

import type { ParseProgress } from '@/lib/types';

interface StatusBarProps {
  progress: ParseProgress | null;
  message: string | null;
}

export function StatusBar({ progress, message }: StatusBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border border-ink/20 bg-white px-3 py-2 text-xs text-ink/70">
      <p>{message ?? 'Готово к работе'}</p>
      {progress && progress.total > 0 && (
        <p>
          Парсинг: {progress.current}/{progress.total} ({progress.filename})
        </p>
      )}
    </div>
  );
}
