"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { resolveEffectiveOptimization } from "@/lib/chart-optimization";
import type {
  ChartGuideMode,
  ChartOptimizationSettings,
  TechnologicalObject,
  TestType,
} from "@/lib/types";
import { ChartControls } from "@/components/charts/ChartControls";
import { ObjectSelector } from "@/components/filters/ObjectSelector";
import { TestTypeSelect } from "@/components/filters/TestTypeSelect";

interface RightSidebarProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onSelectTests: (ids: number[]) => void;
  availableObjects: TechnologicalObject[];
  selectedObjectKeys: string[];
  onChangeObjects: (keys: string[]) => void;
  showAverage: boolean;
  guideMode: ChartGuideMode;
  onToggleAverage: (show: boolean) => void;
  onGuideModeChange: (mode: ChartGuideMode) => void;
  optimization: ChartOptimizationSettings;
  pointCount: number;
  onOptimizationChange: (next: Partial<ChartOptimizationSettings>) => void;
}

export function RightSidebar({
  testTypes,
  selectedTestIds,
  onSelectTests,
  availableObjects,
  selectedObjectKeys,
  onChangeObjects,
  showAverage,
  guideMode,
  onToggleAverage,
  onGuideModeChange,
  optimization,
  pointCount,
  onOptimizationChange,
}: RightSidebarProps) {
  const [openSections, setOpenSections] = useState({
    test: true,
    tanks: true,
    average: true,
    optimization: true,
  });
  const [averageEmaDraft, setAverageEmaDraft] = useState(
    String(optimization.averageEmaAlpha),
  );
  const [lineEmaDraft, setLineEmaDraft] = useState(String(optimization.emaAlpha));
  const [isEditingAverageEma, setIsEditingAverageEma] = useState(false);
  const [isEditingLineEma, setIsEditingLineEma] = useState(false);
  const [showAverageInfo, setShowAverageInfo] = useState(false);

  const effectiveOptimization = useMemo(
    () => resolveEffectiveOptimization(optimization, pointCount),
    [optimization, pointCount],
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!isEditingAverageEma) {
      setAverageEmaDraft(String(optimization.averageEmaAlpha));
    }
  }, [isEditingAverageEma, optimization.averageEmaAlpha]);

  useEffect(() => {
    if (!isEditingLineEma) {
      setLineEmaDraft(
        String(
          optimization.autoOptimize
            ? effectiveOptimization.emaAlpha
            : optimization.emaAlpha,
        ),
      );
    }
  }, [
    effectiveOptimization.emaAlpha,
    isEditingLineEma,
    optimization.autoOptimize,
    optimization.emaAlpha,
  ]);

  useEffect(() => {
    if (optimization.averageApproximation === "raw") {
      onOptimizationChange({ averageApproximation: "moving_average" });
    }
  }, [onOptimizationChange, optimization.averageApproximation]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-x-hidden border border-ink/20 bg-white p-3">
      <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-auto overflow-x-hidden">
        <section className="min-w-0 space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
              Испытание
            </p>
            <button
              type="button"
              className="text-ink/60 transition hover:text-ink"
              onClick={() => toggleSection("test")}
              title={openSections.test ? "Свернуть" : "Развернуть"}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.test ? "rotate-180" : "rotate-0"}`}
              />
            </button>
          </div>
          {openSections.test && (
            <>
              <div className="min-w-0">
                <TestTypeSelect
                  testTypes={testTypes}
                  selectedTestIds={selectedTestIds}
                  onChange={onSelectTests}
                />
              </div>
            </>
          )}
        </section>

        <section className="min-w-0 space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
              Технологические объекты
            </p>
            <button
              type="button"
              className="text-ink/60 transition hover:text-ink"
              onClick={() => toggleSection("tanks")}
              title={openSections.tanks ? "Свернуть" : "Развернуть"}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.tanks ? "rotate-180" : "rotate-0"}`}
              />
            </button>
          </div>
          {openSections.tanks && (
            <>
              <p className="text-[11px] text-ink/50">
                Отметьте объекты, которые нужно отображать на графике.
              </p>
              <div className="min-w-0">
                <ObjectSelector
                  objects={availableObjects}
                  selectedKeys={selectedObjectKeys}
                  onChange={onChangeObjects}
                />
              </div>
            </>
          )}
        </section>

        <section className="min-w-0 space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
              Средняя линия
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-ink/60 transition hover:text-ink"
                onClick={() => setShowAverageInfo((prev) => !prev)}
                title={showAverageInfo ? "Скрыть пояснение" : "Показать пояснение"}
              >
                <Info className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="text-ink/60 transition hover:text-ink"
                onClick={() => toggleSection("average")}
                title={openSections.average ? "Свернуть" : "Развернуть"}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${openSections.average ? "rotate-180" : "rotate-0"}`}
                />
              </button>
            </div>
          </div>
          {showAverageInfo && (
            <p className="rounded border border-ink/20 bg-[#f7f8fa] px-2 py-1.5 text-[11px] text-ink/70">
              Средняя линия строится по выбранным технологическим объектам. Если
              она полностью совпадает с графиком параметра, лишняя линия
              скрывается. Вспомогательные линии можно переключать между
              графиками и средними значениями.
            </p>
          )}
          {openSections.average && (
            <>
              <p className="text-[11px] text-ink/50">
                Настройка вычисления и сглаживания средней линии.
              </p>
              <ChartControls
                showAverage={showAverage}
                guideMode={guideMode}
                onToggleAverage={onToggleAverage}
                onGuideModeChange={onGuideModeChange}
              />

              <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                Функция средней линии
                <select
                  className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  value={optimization.averageApproximation}
                  onChange={(event) =>
                    onOptimizationChange({
                      averageApproximation: event.target
                        .value as ChartOptimizationSettings["averageApproximation"],
                    })
                  }
                >
                  <option value="moving_average">Скользящая средняя</option>
                  <option value="ema">EMA</option>
                </select>
              </label>

              {optimization.averageApproximation === "moving_average" && (
                <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                  Окно для средней линии
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={optimization.averageMovingAverageWindow}
                    onChange={(event) =>
                      onOptimizationChange({
                        averageMovingAverageWindow: Math.min(
                          50,
                          Math.max(2, Number(event.target.value) || 2),
                        ),
                      })
                    }
                    className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  />
                </label>
              )}

              {optimization.averageApproximation === "ema" && (
                <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                  EMA alpha средней (0..1)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={averageEmaDraft}
                    onFocus={() => setIsEditingAverageEma(true)}
                    onChange={(event) => setAverageEmaDraft(event.target.value)}
                    onBlur={() => {
                      setIsEditingAverageEma(false);
                      const parsed = parseEmaValue(
                        averageEmaDraft,
                        optimization.averageEmaAlpha,
                      );
                      onOptimizationChange({ averageEmaAlpha: parsed });
                      setAverageEmaDraft(String(parsed));
                    }}
                    className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  />
                </label>
              )}
            </>
          )}
        </section>

        <section className="min-w-0 space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
              Оптимизация графика
            </p>
            <button
              type="button"
              className="text-ink/60 transition hover:text-ink"
              onClick={() => toggleSection("optimization")}
              title={openSections.optimization ? "Свернуть" : "Развернуть"}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.optimization ? "rotate-180" : "rotate-0"}`}
              />
            </button>
          </div>
          {openSections.optimization && (
            <>
              <p className="text-[11px] text-ink/50">
                Параметры производительности и аппроксимации линий.
              </p>

              <label className="flex items-center gap-2 border border-ink/20 px-2 py-1.5 text-xs text-ink/75">
                <input
                  type="checkbox"
                  checked={optimization.autoOptimize}
                  onChange={(event) =>
                    onOptimizationChange({ autoOptimize: event.target.checked })
                  }
                  className="accent-ink"
                />
                Автоматическая оптимизация
              </label>
              {!optimization.autoOptimize && (
                <>
                  <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                    Аппроксимация линий объектов
                    <select
                      className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                      value={effectiveOptimization.lineApproximation}
                      onChange={(event) =>
                        onOptimizationChange({
                          lineApproximation: event.target
                            .value as ChartOptimizationSettings["lineApproximation"],
                        })
                      }
                    >
                      <option value="raw">Без аппроксимации</option>
                      <option value="moving_average">Скользящая средняя</option>
                      <option value="ema">EMA</option>
                    </select>
                  </label>

                  <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                    Сжатие точек (N)
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={effectiveOptimization.pointCompression}
                      onChange={(event) =>
                        onOptimizationChange({
                          pointCompression: Math.min(
                            120,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        })
                      }
                      className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                    />
                  </label>

                  {effectiveOptimization.lineApproximation === "moving_average" && (
                    <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                      Окно скользящего среднего
                      <input
                        type="number"
                        min={2}
                        max={40}
                        value={effectiveOptimization.movingAverageWindow}
                        onChange={(event) =>
                          onOptimizationChange({
                            movingAverageWindow: Math.min(
                              40,
                              Math.max(2, Number(event.target.value) || 2),
                            ),
                          })
                        }
                        className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                      />
                    </label>
                  )}

                  {effectiveOptimization.lineApproximation === "ema" && (
                    <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                      EMA alpha (0..1)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lineEmaDraft}
                        onFocus={() => setIsEditingLineEma(true)}
                        onChange={(event) => setLineEmaDraft(event.target.value)}
                        onBlur={() => {
                          setIsEditingLineEma(false);
                          const parsed = parseEmaValue(lineEmaDraft, optimization.emaAlpha);
                          onOptimizationChange({ emaAlpha: parsed });
                          setLineEmaDraft(String(parsed));
                        }}
                        className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                      />
                    </label>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </aside>
  );
}

function parseEmaValue(raw: string, fallback: number): number {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(0.95, Math.max(0.05, parsed));
}
