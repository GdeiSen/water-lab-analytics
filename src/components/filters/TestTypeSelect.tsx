"use client";

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import clsx from "clsx";

import type { ParameterLink, TestType } from "@/lib/types";

interface TestTypeSelectProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onChange: (ids: number[]) => void;
  parameterLinks?: ParameterLink[];
  pendingLinkTestId?: number | null;
  onToggleParameterLink?: (testId: number) => void;
}

export function TestTypeSelect({
  testTypes,
  selectedTestIds,
  onChange,
  parameterLinks = [],
  pendingLinkTestId = null,
  onToggleParameterLink,
}: TestTypeSelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = normalizeSearch(searchQuery);
  const sorted = useMemo(
    () =>
      [...testTypes].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    [testTypes],
  );
  const filtered = useMemo(() => {
    if (!normalizedSearchQuery) {
      return sorted;
    }
    return sorted.filter((test) =>
      normalizeSearch(`${test.displayName} ${test.canonicalName} ${test.unit ?? ""}`).includes(
        normalizedSearchQuery,
      ),
    );
  }, [normalizedSearchQuery, sorted]);
  const selected = new Set(selectedTestIds);
  const activePairByTestId = new Map<number, ParameterLink>();
  parameterLinks.forEach((link) => {
    if (selected.has(link.inputTestId) && selected.has(link.outputTestId)) {
      activePairByTestId.set(link.inputTestId, link);
      activePairByTestId.set(link.outputTestId, link);
    }
  });

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
    <div className="space-y-1.5">
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Поиск испытаний"
        className="h-8 w-full border border-ink/20 bg-white px-2 text-xs text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/50 focus:ring-2 focus:ring-ink/10"
      />
      <div className="border border-ink/30 bg-white p-1.5">
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
      <div className="max-h-52 space-y-1 overflow-auto">
        {filtered.length === 0 && (
          <div className="px-1.5 py-2 text-xs text-ink/45">Ничего не найдено</div>
        )}
        {filtered.map((test) => {
          const activePair = activePairByTestId.get(test.id);
          const isPendingLink = pendingLinkTestId === test.id;
          return (
            <div
              key={`${test.id}-${activePair?.id ?? 'none'}-${isPendingLink ? 'pending' : 'idle'}`}
              className={clsx(
                "group relative flex items-center gap-2 border border-transparent px-1.5 py-1 text-xs hover:border-ink/20",
                isPendingLink && "border-amber-400/70 bg-amber-50",
              )}
            >
              <label
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                title={test.displayName}
              >
                <input
                  type="checkbox"
                  checked={selectedTestIds.includes(test.id)}
                  onChange={() => toggleTest(test.id)}
                  className="accent-ink"
                />
                <span className="min-w-0 flex-1 truncate">{test.displayName}</span>
              </label>
              {onToggleParameterLink && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    onToggleParameterLink(test.id);
                  }}
                  className={clsx(
                    "shrink-0 rounded-sm border p-0.5 transition",
                    activePair
                      ? "border-surge/30 bg-surge/10 text-surge opacity-100"
                      : isPendingLink
                        ? "animate-pulse border-amber-500 bg-amber-300 text-ink opacity-100"
                        : "border-transparent text-ink/35 opacity-0 hover:border-ink/20 hover:bg-ink/5 hover:text-ink hover:opacity-100 group-hover:opacity-100",
                  )}
                  title={
                    activePair
                      ? "Отключить связку эффективности"
                      : isPendingLink
                        ? "Отменить выбор первого параметра"
                        : pendingLinkTestId
                          ? "Выбрать вторым параметром пары"
                          : "Выбрать первым параметром пары"
                  }
                  aria-label="Настроить связку эффективности"
                >
                  {(activePair || isPendingLink) && <Link2 className="h-3.5 w-3.5" />}
                  {!activePair && !isPendingLink && (
                    <Link2 className="h-3.5 w-3.5 opacity-70" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
