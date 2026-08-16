'use client';

import { useEffect, useMemo } from 'react';

import type { TechnologicalObject, TestType } from '@/lib/types';

/**
 * Reconciles the persisted test/object selection against what's actually
 * available right now (e.g. after switching archives) — falls back to the
 * first visible test type, prunes selected objects that no longer exist,
 * and writes the pruned test selection back to the store. Shared by both
 * daily and retro mode (see src/app/page.tsx); retro mode has no object
 * dimension and omits the last two arguments.
 */
export function useEffectiveSelection(
  selectedTestIds: number[],
  visibleTestTypes: TestType[],
  setSelectedTestIds: (ids: number[]) => void,
  selectedObjectKeys: string[] = [],
  availableObjects: TechnologicalObject[] = []
) {
  const effectiveSelectedTestIds = useMemo(() => {
    const available = new Set(visibleTestTypes.map((item) => item.id));
    if (selectedTestIds.length === 0) {
      return [];
    }
    const filtered = selectedTestIds.filter((id) => available.has(id));
    if (filtered.length > 0) {
      return filtered;
    }
    return visibleTestTypes[0] ? [visibleTestTypes[0].id] : [];
  }, [selectedTestIds, visibleTestTypes]);

  useEffect(() => {
    const visibleIds = new Set(visibleTestTypes.map((test) => test.id));
    const filtered = selectedTestIds.filter((id) => visibleIds.has(id));
    if (filtered.length !== selectedTestIds.length) {
      setSelectedTestIds(filtered);
    }
  }, [selectedTestIds, setSelectedTestIds, visibleTestTypes]);

  const effectiveSelectedObjectKeys = useMemo(() => {
    const available = new Set(availableObjects.map((item) => item.key));
    return selectedObjectKeys.filter((key) => available.has(key));
  }, [availableObjects, selectedObjectKeys]);

  return { effectiveSelectedTestIds, effectiveSelectedObjectKeys };
}
