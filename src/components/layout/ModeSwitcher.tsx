'use client';

import { History, LineChart } from 'lucide-react';
import clsx from 'clsx';

import type { AppMode } from '@/lib/types';

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

const MODES: Array<{ key: AppMode; label: string; icon: typeof LineChart }> = [
  { key: 'daily', label: 'Ежесуточные данные', icon: LineChart },
  { key: 'retro', label: 'Ретроспективный анализ', icon: History }
];

/**
 * Top-level tab switcher between the everyday parsing workflow and the
 * retrospective (multi-year, multi-period) analysis workflow. Both modes
 * reuse the same Sidebar/MainArea/RightSidebar components — this control
 * only decides which mode-scoped store feeds them (see src/app/page.tsx).
 */
export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Режим работы"
      className="flex h-9 border border-ink/30 bg-white"
    >
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => onChange(key)}
          className={clsx(
            'flex items-center gap-2 border-r border-ink/30 px-3 text-xs font-semibold uppercase tracking-wide transition last:border-r-0',
            mode === key ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
