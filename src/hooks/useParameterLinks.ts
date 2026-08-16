'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildManualParameterLinkLabel,
  buildParameterLinks,
  filterDuplicateScopedTestTypes,
  isSameParameterPair
} from '@/lib/parameter-links';
import type { ParameterLink, TestType } from '@/lib/types';

/**
 * Auto/manual input->output parameter linking (used for efficiency %,
 * Pearson correlation, etc. in StatsSummary), extracted from the daily-mode
 * page so both the daily and retro archives get identical link behavior —
 * see src/app/page.tsx.
 */
export function useParameterLinks(
  testTypes: TestType[],
  selectedTestIds: number[],
  setSelectedTestIds: (ids: number[]) => void
) {
  const [manualParameterLinks, setManualParameterLinks] = useState<ParameterLink[]>([]);
  const [disabledAutoParameterLinkIds, setDisabledAutoParameterLinkIds] = useState<string[]>([]);
  const [pendingLinkTestId, setPendingLinkTestId] = useState<number | null>(null);

  const visibleTestTypes = useMemo(() => filterDuplicateScopedTestTypes(testTypes), [testTypes]);

  const autoParameterLinks = useMemo(() => buildParameterLinks(visibleTestTypes), [visibleTestTypes]);
  const parameterLinks = useMemo(() => {
    const disabled = new Set(disabledAutoParameterLinkIds);
    const effectiveAuto = autoParameterLinks.filter((link) => !disabled.has(link.id));
    const usedIds = new Set(effectiveAuto.map((link) => link.id));
    const effectiveManual = manualParameterLinks.filter((link) => !usedIds.has(link.id));
    return [...effectiveAuto, ...effectiveManual];
  }, [autoParameterLinks, disabledAutoParameterLinkIds, manualParameterLinks]);

  useEffect(() => {
    const availableIds = new Set(visibleTestTypes.map((test) => test.id));
    setManualParameterLinks((links) =>
      links.filter((link) => availableIds.has(link.inputTestId) && availableIds.has(link.outputTestId))
    );
    setDisabledAutoParameterLinkIds((ids) => ids.filter((id) => autoParameterLinks.some((link) => link.id === id)));
    setPendingLinkTestId((id) => (id && availableIds.has(id) ? id : null));
  }, [autoParameterLinks, visibleTestTypes]);

  const handleToggleParameterLink = useCallback(
    (testId: number) => {
      const selected = new Set(selectedTestIds);
      const activeLinks = parameterLinks.filter(
        (link) =>
          selected.has(link.inputTestId) &&
          selected.has(link.outputTestId) &&
          (link.inputTestId === testId || link.outputTestId === testId)
      );

      if (activeLinks.length > 0) {
        const autoLinks = activeLinks.filter((link) => link.source === 'auto');
        const manualLinks = activeLinks.filter((link) => link.source === 'manual');

        if (autoLinks.length > 0) {
          setDisabledAutoParameterLinkIds((ids) => Array.from(new Set([...ids, ...autoLinks.map((link) => link.id)])));
        }
        if (manualLinks.length > 0) {
          const removedIds = new Set(manualLinks.map((link) => link.id));
          setManualParameterLinks((links) => links.filter((link) => !removedIds.has(link.id)));
        }
        setPendingLinkTestId(null);
        return;
      }

      if (pendingLinkTestId === null) {
        setPendingLinkTestId(testId);
        return;
      }

      if (pendingLinkTestId === testId) {
        setPendingLinkTestId(null);
        return;
      }

      const input = testTypes.find((test) => test.id === pendingLinkTestId);
      const output = testTypes.find((test) => test.id === testId);
      if (!input || !output) {
        setPendingLinkTestId(null);
        return;
      }

      const autoLink = autoParameterLinks.find((link) =>
        isSameParameterPair(link.inputTestId, link.outputTestId, input.id, output.id)
      );
      if (autoLink) {
        setDisabledAutoParameterLinkIds((ids) => ids.filter((id) => id !== autoLink.id));
      } else {
        const [firstId, secondId] = [input.id, output.id].sort((left, right) => left - right);
        const nextLink: ParameterLink = {
          id: `manual-${firstId}-${secondId}`,
          label: buildManualParameterLinkLabel(input.displayName, output.displayName),
          inputTestId: input.id,
          inputTestName: input.displayName,
          outputTestId: output.id,
          outputTestName: output.displayName,
          source: 'manual'
        };
        setManualParameterLinks((links) => [...links.filter((link) => link.id !== nextLink.id), nextLink]);
      }

      setSelectedTestIds(Array.from(new Set([...selectedTestIds, input.id, output.id])));
      setPendingLinkTestId(null);
    },
    [autoParameterLinks, parameterLinks, pendingLinkTestId, selectedTestIds, setSelectedTestIds, testTypes]
  );

  return {
    visibleTestTypes,
    parameterLinks,
    pendingLinkTestId,
    handleToggleParameterLink
  };
}
