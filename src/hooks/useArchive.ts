'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import { api, pickArchiveFolder } from '@/lib/tauri-api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useDataStore } from '@/stores/data-store';

interface OpenArchiveOptions {
  silent?: boolean;
}

export function useArchive() {
  const session = useAuthStore((state) => state.session);

  const {
    archiveSummary,
    setArchiveSummary,
    setFiles,
    setTestTypes,
    setSelectedTestIds,
    setSelectedFileId,
    setFileDetails,
    selectedTestIds,
    setSelectedObjectKeys,
    setChartData,
    setDateRange,
    setParseProgress,
    setBusy,
    setStatusMessage
  } = useDataStore();

  const openArchiveByPath = useCallback(
    async (path: string, options: OpenArchiveOptions = {}) => {
      if (!session) {
        throw new Error('Сначала выполните вход');
      }

      setBusy(true);
      setArchiveSummary(null);
      setFiles([]);
      setSelectedFileId(null);
      setFileDetails(null);
      setSelectedObjectKeys([]);
      setTestTypes([]);
      setSelectedTestIds([]);
      setChartData(null);
      setDateRange({ from: null, to: null });
      setParseProgress(null);
      if (!options.silent) {
        setStatusMessage('Сканирование архива...');
      }

      try {
        const summary = await api.selectArchive(session.token, path);
        setArchiveSummary(summary);

        const files = await api.getFileList(session.token, summary.archiveId);
        setFiles(files);
        setSelectedFileId(files[0]?.id ?? null);
        if (files[0]) {
          const details = await api.getFileDetails(session.token, files[0].id);
          setFileDetails(details);
          setSelectedObjectKeys(details.objects.filter((item) => item.active).map((item) => item.key));
        } else {
          setFileDetails(null);
          setSelectedObjectKeys([]);
        }

        const testTypes = await api.getTestTypes(session.token, summary.archiveId);
        setTestTypes(testTypes);
        const nextTestIds = testTypes[0] ? [testTypes[0].id] : [];
        setSelectedTestIds(nextTestIds);

        setStatusMessage(`Архив обновлён: ${summary.totalFiles} файлов`);
        if (!options.silent) {
          toast.success(`Архив обработан за ${summary.durationMs} мс`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось открыть архив';
        setStatusMessage(message);
        if (!options.silent) {
          toast.error(message);
        }
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [
      session,
      setArchiveSummary,
      setBusy,
      setChartData,
      setDateRange,
      setFileDetails,
      setFiles,
      setParseProgress,
      setSelectedFileId,
      setSelectedObjectKeys,
      setSelectedTestIds,
      setStatusMessage,
      setTestTypes
    ]
  );

  const selectArchive = useCallback(async () => {
    if (!session) {
      throw new Error('Сначала выполните вход');
    }

    const path = await pickArchiveFolder();
    if (!path) {
      return;
    }

    await openArchiveByPath(path);
  }, [openArchiveByPath, session]);

  const loadFileDetails = useCallback(
    async (fileId: number) => {
      if (!session) {
        return;
      }

      setSelectedFileId(fileId);
      try {
        const details = await api.getFileDetails(session.token, fileId);
        setFileDetails(details);
        setStatusMessage(`Файл ${details.filename} (${formatDate(details.date)})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить детали файла';
        toast.error(message);
      }
    },
    [session, setFileDetails, setSelectedFileId, setStatusMessage]
  );

  const rescan = useCallback(async () => {
    if (!session || !archiveSummary) {
      return;
    }

    setBusy(true);
    try {
      const summary = await api.rescanArchive(session.token, archiveSummary.archiveId);
      setArchiveSummary(summary);
      const files = await api.getFileList(session.token, summary.archiveId);
      setFiles(files);
      setSelectedFileId(files[0]?.id ?? null);
      if (files[0]) {
        const details = await api.getFileDetails(session.token, files[0].id);
        setFileDetails(details);
        setSelectedObjectKeys(details.objects.filter((item) => item.active).map((item) => item.key));
      } else {
        setFileDetails(null);
        setSelectedObjectKeys([]);
      }
      const testTypes = await api.getTestTypes(session.token, summary.archiveId);
      setTestTypes(testTypes);
      const availableTestIds = new Set(testTypes.map((item) => item.id));
      const preserved = selectedTestIds.filter((id) => availableTestIds.has(id));
      setSelectedTestIds(preserved.length > 0 ? preserved : testTypes[0] ? [testTypes[0].id] : []);
      setChartData(null);
      toast.success('Архив пересканирован');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось пересканировать архив';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [
    archiveSummary,
    session,
    setArchiveSummary,
    setBusy,
    setChartData,
    setFileDetails,
    setFiles,
    setSelectedFileId,
    setSelectedObjectKeys,
    setSelectedTestIds,
    setTestTypes,
    selectedTestIds
  ]);

  return {
    archiveSummary,
    selectArchive,
    openArchiveByPath,
    loadFileDetails,
    rescan
  };
}
