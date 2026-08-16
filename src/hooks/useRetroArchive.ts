'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import { api, pickArchiveFolder } from '@/lib/tauri-api';
import { useAuthStore } from '@/stores/auth-store';
import { useRetroDataStore } from '@/stores/retro-data-store';

interface OpenRetroArchiveOptions {
  silent?: boolean;
}

/**
 * Mirrors `useArchive` for the retrospective archive — same shape, same
 * flow (pick folder -> scan -> load first file -> load test types), just
 * pointed at the retro store/API instead of the daily one. Kept as a
 * separate hook (rather than a mode branch inside `useArchive`) so the two
 * archives never share loading/selection state.
 */
export function useRetroArchive() {
  const session = useAuthStore((state) => state.session);

  const {
    archiveSummary,
    setArchiveSummary,
    setFiles,
    setTestTypes,
    setAllTestTypes,
    setSelectedTestIds,
    setSelectedFileId,
    setFileDetails,
    selectedTestIds,
    setChartData,
    setDateRange,
    setParseProgress,
    setBusy,
    setStatusMessage
  } = useRetroDataStore();

  /**
   * Loads one sheet: its details plus *its* parameter list, and points the
   * selection at that sheet's first parameter. This is what makes the
   * sidebar show the parameters of the file the user just clicked instead
   * of every parameter in the archive.
   */
  const loadFileScopedTests = useCallback(
    async (token: string, fileId: number) => {
      const [details, tests] = await Promise.all([
        api.getRetroFileDetails(token, fileId),
        api.getRetroTestTypes(token, undefined, fileId)
      ]);
      setFileDetails(details);
      setTestTypes(tests);
      return tests;
    },
    [setFileDetails, setTestTypes]
  );

  const openRetroArchiveByPath = useCallback(
    async (path: string, options: OpenRetroArchiveOptions = {}) => {
      if (!session) {
        throw new Error('Сначала выполните вход');
      }

      setBusy(true);
      setArchiveSummary(null);
      setFiles([]);
      setSelectedFileId(null);
      setFileDetails(null);
      setTestTypes([]);
      setAllTestTypes([]);
      setSelectedTestIds([]);
      setChartData(null);
      setDateRange({ from: null, to: null });
      setParseProgress(null);
      if (!options.silent) {
        setStatusMessage('Сканирование ретроспективного архива...');
      }

      try {
        const summary = await api.selectRetroArchive(session.token, path);
        setArchiveSummary(summary);

        const files = await api.getRetroFileList(session.token, summary.archiveId);
        setFiles(files);
        setSelectedFileId(files[0]?.id ?? null);
        setAllTestTypes(await api.getRetroTestTypes(session.token, summary.archiveId));

        if (files[0]) {
          const fileTests = await loadFileScopedTests(session.token, files[0].id);
          setSelectedTestIds(fileTests[0] ? [fileTests[0].id] : []);
        } else {
          setFileDetails(null);
          setTestTypes([]);
          setSelectedTestIds([]);
        }

        setStatusMessage(`Ретроспективный архив обновлён: ${summary.totalFiles} файлов`);
        if (!options.silent) {
          toast.success(`Архив обработан за ${summary.durationMs} мс`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось открыть ретроспективный архив';
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
      loadFileScopedTests,
      session,
      setAllTestTypes,
      setArchiveSummary,
      setBusy,
      setChartData,
      setDateRange,
      setFileDetails,
      setFiles,
      setParseProgress,
      setSelectedFileId,
      setSelectedTestIds,
      setStatusMessage,
      setTestTypes
    ]
  );

  const selectRetroArchive = useCallback(async () => {
    if (!session) {
      throw new Error('Сначала выполните вход');
    }

    const path = await pickArchiveFolder();
    if (!path) {
      return;
    }

    await openRetroArchiveByPath(path);
  }, [openRetroArchiveByPath, session]);

  const loadRetroFileDetails = useCallback(
    async (fileId: number) => {
      if (!session) {
        return;
      }

      setSelectedFileId(fileId);
      try {
        const tests = await loadFileScopedTests(session.token, fileId);
        // Parameters picked in other sheets stay on the chart (that is what
        // lets an inlet series be compared against an outlet one); only when
        // nothing is selected at all does the new sheet's first parameter
        // get picked, so the chart is never blank after switching files.
        setSelectedTestIds(
          useRetroDataStore.getState().selectedTestIds.length > 0
            ? useRetroDataStore.getState().selectedTestIds
            : tests[0]
              ? [tests[0].id]
              : []
        );
        setStatusMessage(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить детали файла';
        toast.error(message);
      }
    },
    [loadFileScopedTests, session, setSelectedFileId, setSelectedTestIds, setStatusMessage]
  );

  const rescanRetroArchive = useCallback(async () => {
    if (!session || !archiveSummary) {
      return;
    }

    setBusy(true);
    try {
      const summary = await api.rescanRetroArchive(session.token, archiveSummary.archiveId);
      setArchiveSummary(summary);
      const files = await api.getRetroFileList(session.token, summary.archiveId);
      setFiles(files);
      setSelectedFileId(files[0]?.id ?? null);
      const archiveTests = await api.getRetroTestTypes(session.token, summary.archiveId);
      setAllTestTypes(archiveTests);

      const fileTests = files[0] ? await loadFileScopedTests(session.token, files[0].id) : [];
      if (!files[0]) {
        setFileDetails(null);
        setTestTypes([]);
      }
      const availableTestIds = new Set(archiveTests.map((item) => item.id));
      const preserved = selectedTestIds.filter((id) => availableTestIds.has(id));
      setSelectedTestIds(preserved.length > 0 ? preserved : fileTests[0] ? [fileTests[0].id] : []);
      setChartData(null);
      toast.success('Ретроспективный архив пересканирован');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось пересканировать архив';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [
    archiveSummary,
    loadFileScopedTests,
    session,
    setAllTestTypes,
    setArchiveSummary,
    setBusy,
    setChartData,
    setFileDetails,
    setFiles,
    setSelectedFileId,
    setSelectedTestIds,
    setTestTypes,
    selectedTestIds
  ]);

  return {
    archiveSummary,
    selectRetroArchive,
    openRetroArchiveByPath,
    loadRetroFileDetails,
    rescanRetroArchive
  };
}
