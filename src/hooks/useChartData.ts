'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/tauri-api';
import { useAuthStore } from '@/stores/auth-store';
import { useDataStore } from '@/stores/data-store';

export function useChartData() {
  const session = useAuthStore((state) => state.session);

  const {
    archiveSummary,
    selectedTestIds,
    dateRange,
    setChartData,
    setStatusMessage
  } = useDataStore();

  useEffect(() => {
    if (!session || !archiveSummary || selectedTestIds.length === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const chart = await api.getChartData(session.token, {
          archiveId: archiveSummary.archiveId,
          testIds: selectedTestIds,
          objectKeys: [],
          dateFrom: dateRange.from,
          dateTo: dateRange.to
        });
        setChartData(chart);
        setStatusMessage(`Загружено точек: ${chart.points.length}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить данные графика';
        toast.error(message);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    archiveSummary,
    dateRange.from,
    dateRange.to,
    selectedTestIds,
    session,
    setChartData,
    setStatusMessage
  ]);
}
