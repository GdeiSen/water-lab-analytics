'use client';

import clsx from 'clsx';

import { STATUS_LABELS } from '@/lib/utils';

interface FileStatusBadgeProps {
  status: string;
}

export function FileStatusBadge({ status }: FileStatusBadgeProps) {
  return (
    <span
      className={clsx(
        'shrink-0 border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        status === 'ok' && 'bg-leaf/15 text-leaf',
        status === 'warning' && 'bg-warning/20 text-warning',
        status === 'error' && 'bg-ember/15 text-ember',
        status !== 'ok' && status !== 'warning' && status !== 'error' && 'bg-ink/10 text-ink/70'
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
