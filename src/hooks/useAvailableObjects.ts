'use client';

import { useMemo } from 'react';

import type { ChartObject, TechnologicalObject } from '@/lib/types';

/**
 * Resolves the object list to show in the object picker: prefer the
 * selected file's own objects, fall back to whatever the current chart
 * query returned, and as a last resort synthesize plain 1..N objects from
 * the widest file seen so far. Daily mode only — a retrospective sheet is a
 * single sampling point and has no object dimension at all (see
 * `RETRO_OBJECT_KEY` on the Rust side).
 */
export function useAvailableObjects(
  fileObjects: TechnologicalObject[] | undefined,
  chartObjects: ChartObject[] | undefined,
  filesForFallbackCount: Array<{ objectCount: number }>
): TechnologicalObject[] {
  return useMemo(() => {
    if (fileObjects && fileObjects.length > 0) {
      return fileObjects;
    }
    if (chartObjects && chartObjects.length > 0) {
      return chartObjects.map((item) => ({
        key: item.objectKey,
        label: item.objectLabel,
        order: item.objectOrder,
        active: item.objectActive
      }));
    }

    const maxObjectCount = filesForFallbackCount.reduce((max, file) => Math.max(max, file.objectCount), 0);
    return Array.from({ length: maxObjectCount }, (_, index) => ({
      key: String(index + 1),
      label: String(index + 1),
      order: index + 1,
      active: true
    }));
  }, [chartObjects, fileObjects, filesForFallbackCount]);
}

/** Sorted, de-duplicated ISO date list — used both as the date-range picker's bounds and as period-preset input. */
export function useAvailableDates(dates: string[]): string[] {
  return useMemo(() => {
    const unique = new Set(dates);
    return Array.from(unique).sort((left, right) => left.localeCompare(right));
  }, [dates]);
}
