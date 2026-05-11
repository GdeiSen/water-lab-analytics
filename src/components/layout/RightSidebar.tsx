"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { resolveEffectiveOptimization } from "@/lib/chart-optimization";
import type {
  ChartGuideMode,
  ChartOptimizationSettings,
  ChartTrendlineSettings,
  ParameterLink,
  TechnologicalObject,
  TestType,
} from "@/lib/types";
import { AnalysisModeControl } from "@/components/charts/ChartControls";
import { ObjectSelector } from "@/components/filters/ObjectSelector";
import { TestTypeSelect } from "@/components/filters/TestTypeSelect";

interface RightSidebarProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onSelectTests: (ids: number[]) => void;
  parameterLinks: ParameterLink[];
  pendingLinkTestId?: number | null;
  onToggleParameterLink?: (testId: number) => void;
  availableObjects: TechnologicalObject[];
  selectedObjectKeys: string[];
  onChangeObjects: (keys: string[]) => void;
  guideMode: ChartGuideMode;
  onGuideModeChange: (mode: ChartGuideMode) => void;
  optimization: ChartOptimizationSettings;
  trendline: ChartTrendlineSettings;
  pointCount: number;
  onOptimizationChange: (next: Partial<ChartOptimizationSettings>) => void;
  onTrendlineChange: (next: Partial<ChartTrendlineSettings>) => void;
}

export function RightSidebar({
  testTypes,
  selectedTestIds,
  onSelectTests,
  parameterLinks,
  pendingLinkTestId = null,
  onToggleParameterLink,
  availableObjects,
  selectedObjectKeys,
  onChangeObjects,
  guideMode,
  onGuideModeChange,
  optimization,
  trendline,
  pointCount,
  onOptimizationChange,
  onTrendlineChange,
}: RightSidebarProps) {
  const [openSections, setOpenSections] = useState({
    test: true,
    tanks: true,
    analysis: true,
    trendline: true,
    optimization: true,
  });
  const [lineEmaDraft, setLineEmaDraft] = useState(String(optimization.emaAlpha));
  const [isEditingLineEma, setIsEditingLineEma] = useState(false);

  const effectiveOptimization = useMemo(
    () => resolveEffectiveOptimization(optimization, pointCount),
    [optimization, pointCount],
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
                  parameterLinks={parameterLinks}
                  pendingLinkTestId={pendingLinkTestId}
                  onToggleParameterLink={onToggleParameterLink}
                />
              </div>
            </>
          )}
        </section>

        <section className="min-w-0 space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
              Режим анализа
            </p>
            <button
              type="button"
              className="text-ink/60 transition hover:text-ink"
              onClick={() => toggleSection("analysis")}
              title={openSections.analysis ? "Свернуть" : "Развернуть"}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.analysis ? "rotate-180" : "rotate-0"}`}
              />
            </button>
          </div>
          {openSections.analysis && (
            <div className="space-y-2">
              <p className="text-[11px] text-ink/50">
                Выберите, как считать вспомогательные значения и эффективность: по точкам графиков
                или по линиям тренда.
              </p>
              <AnalysisModeControl
                trendEnabled={trendline.enabled}
                guideMode={guideMode}
                onGuideModeChange={onGuideModeChange}
              />
            </div>
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
              Линия тренда
            </p>
            <button
              type="button"
              className="text-ink/60 transition hover:text-ink"
              onClick={() => toggleSection("trendline")}
              title={openSections.trendline ? "Свернуть" : "Развернуть"}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.trendline ? "rotate-180" : "rotate-0"}`}
              />
            </button>
          </div>
          {openSections.trendline && (
            <>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={trendline.enabled}
                  onChange={(event) => onTrendlineChange({ enabled: event.target.checked })}
                  className="accent-ink"
                />
                Показать линию тренда
              </label>

              <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                Показывать по
                <select
                  className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  value={trendline.groupBy}
                  onChange={(event) =>
                    onTrendlineChange({
                      groupBy: event.target.value as ChartTrendlineSettings["groupBy"],
                    })
                  }
                >
                  <option value="test">Испытаниям</option>
                  <option value="object">Объектам</option>
                </select>
              </label>

              <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                Тип функции
                <select
                  className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  value={trendline.mode}
                  onChange={(event) =>
                    onTrendlineChange({
                      mode: event.target.value as ChartTrendlineSettings["mode"],
                    })
                  }
                >
                  <option value="linear">Линейная</option>
                  <option value="power">Степенная</option>
                  <option value="exponential">Экспоненциальная</option>
                  <option value="polynomial">Полиномиальная</option>
                  <option value="logarithmic">Логарифмическая</option>
                  <option value="moving_average">Скользящая средняя</option>
                  <option value="ema">EMA</option>
                  <option value="linear_filter">Линейная фильтрация</option>
                </select>
              </label>

              {trendline.mode === "polynomial" && (
                <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                  Степень полинома
                  <input
                    type="number"
                    min={2}
                    max={4}
                    value={trendline.polynomialDegree}
                    onChange={(event) =>
                      onTrendlineChange({
                        polynomialDegree: Math.min(
                          4,
                          Math.max(2, Number(event.target.value) || 2),
                        ),
                      })
                    }
                    className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  />
                </label>
              )}

              {(trendline.mode === "linear_filter" || trendline.mode === "moving_average") && (
                <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                  Окно
                  <input
                    type="number"
                    min={trendline.mode === "linear_filter" ? 3 : 2}
                    max={trendline.mode === "linear_filter" ? 31 : 50}
                    step={trendline.mode === "linear_filter" ? 2 : 1}
                    value={
                      trendline.mode === "linear_filter"
                        ? trendline.linearFilterWindow
                        : trendline.maWindow
                    }
                    onChange={(event) =>
                      trendline.mode === "linear_filter"
                        ? onTrendlineChange({
                            linearFilterWindow: Math.min(
                              31,
                              Math.max(3, Number(event.target.value) || 3),
                            ),
                          })
                        : onTrendlineChange({
                            maWindow: Math.min(
                              50,
                              Math.max(2, Number(event.target.value) || 2),
                            ),
                          })
                    }
                    className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  />
                </label>
              )}

              {trendline.mode === "ema" && (
                <label className="min-w-0 flex flex-col gap-1 text-xs text-ink/75">
                  EMA alpha (0..1)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(trendline.emaAlpha)}
                    onChange={(event) => {
                      const parsed = parseFloat(event.target.value);
                      if (!Number.isNaN(parsed)) {
                        onTrendlineChange({
                          emaAlpha: Math.min(0.95, Math.max(0.05, parsed)),
                        });
                      }
                    }}
                    className="h-8 w-full min-w-0 border border-ink/30 px-2 text-sm"
                  />
                </label>
              )}

              <label className="flex items-center gap-2 border border-ink/20 px-2 py-1.5 text-xs text-ink/75">
                <input
                  type="checkbox"
                  checked={trendline.showEquation}
                  onChange={(event) =>
                    onTrendlineChange({ showEquation: event.target.checked })
                  }
                  className="accent-ink"
                />
                Показывать формулу
              </label>

              <label className="flex items-center gap-2 border border-ink/20 px-2 py-1.5 text-xs text-ink/75">
                <input
                  type="checkbox"
                  checked={trendline.showRSquared}
                  onChange={(event) =>
                    onTrendlineChange({ showRSquared: event.target.checked })
                  }
                  className="accent-ink"
                />
                Показывать R²
              </label>
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
