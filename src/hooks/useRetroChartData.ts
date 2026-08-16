'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/tauri-api';
import { useAuthStore } from '@/stores/auth-store';
import { useRetroDataStore } from '@/stores/retro-data-store';

/**
 * Mirrors `useChartData` for the retro archive/store, minus the object
 * dimension: a retro parameter already identifies one sheet's series (see
 * `RETRO_OBJECT_KEY` on the Rust side), so the query is driven by the
 * parameter selection alone.
 */
export function useRetroChartData() {
  const session = useAuthStore((state) => state.session);

  const {
    archiveSummary,
    selectedTestIds,
    dateRange,
    setChartData,
    setChartLoading,
    setStatusMessage
  } = useRetroDataStore();

  useEffect(() => {
    if (!session || !archiveSummary || selectedTestIds.length === 0) {
      setChartData(null);
      setChartLoading(false);
      setStatusMessage(null);
      return;
    }

    let cancelled = false;
    setChartLoading(true);
    setStatusMessage('Загрузка данных графика...');
    const timer = setTimeout(async () => {
      try {
        const chart = await api.getRetroChartData(session.token, {
          archiveId: archiveSummary.archiveId,
          testIds: selectedTestIds,
          objectKeys: [],
          dateFrom: dateRange.from,
          dateTo: dateRange.to
        });
        if (cancelled) {
          return;
        }
        setChartData(chart);
        setChartLoading(false);
        setStatusMessage(`Загружено точек: ${chart.points.length}`);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setChartLoading(false);
        const message = error instanceof Error ? error.message : 'Не удалось загрузить данные графика';
        setStatusMessage(message);
        toast.error(message);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    archiveSummary,
    dateRange.from,
    dateRange.to,
    selectedTestIds,
    session,
    setChartData,
    setChartLoading,
    setStatusMessage
  ]);
}
