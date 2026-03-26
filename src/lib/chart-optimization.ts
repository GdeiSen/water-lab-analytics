import type { ApproximationMode, ChartOptimizationSettings } from '@/lib/types';

export interface EffectiveChartOptimization {
  pointCompression: number;
  lineApproximation: ApproximationMode;
  movingAverageWindow: number;
  emaAlpha: number;
  averageApproximation: ApproximationMode;
  averageMovingAverageWindow: number;
  averageEmaAlpha: number;
}

export function resolveEffectiveOptimization(
  base: ChartOptimizationSettings,
  pointCount: number
): EffectiveChartOptimization {
  const manual: EffectiveChartOptimization = {
    pointCompression: clampInt(base.pointCompression, 1, 120),
    lineApproximation: base.lineApproximation,
    movingAverageWindow: clampInt(base.movingAverageWindow, 2, 40),
    emaAlpha: clampFloat(base.emaAlpha, 0.05, 0.95),
    averageApproximation: base.averageApproximation,
    averageMovingAverageWindow: clampInt(base.averageMovingAverageWindow, 2, 50),
    averageEmaAlpha: clampFloat(base.averageEmaAlpha, 0.05, 0.95)
  };

  if (!base.autoOptimize) {
    return manual;
  }

  const auto = computeAutoOptimization(pointCount);
  return {
    ...manual,
    pointCompression: auto.pointCompression,
    lineApproximation: auto.lineApproximation,
    movingAverageWindow: auto.movingAverageWindow,
    emaAlpha: auto.emaAlpha
  };
}

function computeAutoOptimization(pointCount: number): {
  pointCompression: number;
  lineApproximation: ApproximationMode;
  movingAverageWindow: number;
  emaAlpha: number;
} {
  const normalized = Math.max(1, Math.trunc(pointCount));

  // Aim for <= ~900 points on screen for stable interaction.
  const pointCompression = clampInt(Math.ceil(normalized / 900), 1, 120);

  if (pointCompression <= 1) {
    return {
      pointCompression,
      lineApproximation: 'raw',
      movingAverageWindow: 3,
      emaAlpha: 0.35
    };
  }

  if (pointCompression <= 8) {
    return {
      pointCompression,
      lineApproximation: 'moving_average',
      movingAverageWindow: clampInt(3 + Math.floor(pointCompression / 2), 3, 18),
      emaAlpha: 0.3
    };
  }

  return {
    pointCompression,
    lineApproximation: 'ema',
    movingAverageWindow: clampInt(5 + Math.floor(pointCompression / 3), 5, 24),
    emaAlpha: clampFloat(0.28 - pointCompression * 0.01, 0.08, 0.28)
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
