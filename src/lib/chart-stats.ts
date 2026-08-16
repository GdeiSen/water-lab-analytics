import type { ChartStats } from '@/lib/types';

/**
 * Pure mirror of `calculate_stats` in src-tauri/src/storage/database.rs.
 * Used by client-side dataset transforms (currently period overlay) that
 * derive a new `ChartDataset` from an existing one and need to recompute
 * `statsByTest` without a round trip to the backend. Keep this in lockstep
 * with the Rust implementation.
 */
export function calculateChartStats(rawValues: readonly number[]): ChartStats {
  const values = rawValues
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return {
      min: null,
      max: null,
      average: null,
      median: null,
      stdDev: null,
      pointsWithValues: 0
    };
  }

  const length = values.length;
  const min = values[0];
  const max = values[length - 1];
  const sum = values.reduce((acc, value) => acc + value, 0);
  const average = sum / length;

  const median =
    length % 2 === 0 ? (values[length / 2 - 1] + values[length / 2]) / 2 : values[(length - 1) / 2];

  const variance = values.reduce((acc, value) => acc + (value - average) ** 2, 0) / length;
  const stdDev = Math.sqrt(variance);

  return {
    min,
    max,
    average,
    median,
    stdDev,
    pointsWithValues: length
  };
}
