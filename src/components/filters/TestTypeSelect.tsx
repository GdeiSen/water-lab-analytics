"use client";

import type { TestType } from "@/lib/types";

interface TestTypeSelectProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onChange: (ids: number[]) => void;
}

export function TestTypeSelect({
  testTypes,
  selectedTestIds,
  onChange,
}: TestTypeSelectProps) {
  const sorted = [...testTypes].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );

  function toggleTest(testId: number) {
    if (selectedTestIds.includes(testId)) {
      onChange(selectedTestIds.filter((id) => id !== testId));
      return;
    }

    onChange([...selectedTestIds, testId]);
  }

  if (sorted.length === 0) {
    return (
      <div className="border border-ink/30 bg-white px-2 py-2 text-sm text-ink/60">
        Нет данных
      </div>
    );
  }

  return (
    <div className="max-h-52 overflow-auto border border-ink/30 bg-white p-1.5">
      <div className="mb-1 flex items-center justify-between gap-2 border-b border-ink/10 px-1.5 pb-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink/45">
          {selectedTestIds.length === 0
            ? "Ничего не выбрано"
            : `Выбрано: ${selectedTestIds.length}`}
        </span>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={selectedTestIds.length === 0}
          className="text-[11px] font-medium text-ink/70 transition hover:text-ink disabled:cursor-not-allowed disabled:text-ink/30"
        >
          Снять все
        </button>
      </div>
      <div className="space-y-1">
        {sorted.map((test) => (
          <label
            key={test.id}
            className="flex cursor-pointer items-center gap-2 border border-transparent px-1.5 py-1 text-xs hover:border-ink/20"
          >
            <input
              type="checkbox"
              checked={selectedTestIds.includes(test.id)}
              onChange={() => toggleTest(test.id)}
              className="accent-ink"
            />
            <span className="min-w-0 truncate">{test.displayName}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
