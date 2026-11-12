"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { LogOut } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { LoginForm } from "@/components/auth/LoginForm";
import { LicenseActivationScreen } from "@/components/license/LicenseActivationScreen";
import { FileDetails } from "@/components/files/FileDetails";
import { RetroFileDetailsPanel } from "@/components/files/RetroFileDetailsPanel";
import { MainArea } from "@/components/layout/MainArea";
import { InterfaceSettingsMenu } from "@/components/layout/InterfaceSettingsMenu";
import { ModeSwitcher } from "@/components/layout/ModeSwitcher";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useArchive } from "@/hooks/useArchive";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableObjects, useAvailableDates } from "@/hooks/useAvailableObjects";
import { useEffectiveSelection } from "@/hooks/useEffectiveSelection";
import { useChartData } from "@/hooks/useChartData";
import { useParameterLinks } from "@/hooks/useParameterLinks";
import { useRetroArchive } from "@/hooks/useRetroArchive";
import { useRetroChartData } from "@/hooks/useRetroChartData";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { AUTH_BYPASS_ENABLED } from "@/lib/app-config";
import { buildExportDefaultName, dataUrlToBytes, exportChartExcel } from "@/lib/chart-export";
import {
  buildPeriodEfficiencyGroups,
  buildPeriodOverlayDataset,
  formatPhaseLabel,
} from "@/lib/period-overlay";
import { api, isTauriRuntime, pickExportPath } from "@/lib/tauri-api";
import type { AppMode, ChartGuideMode, LicenseStatus } from "@/lib/types";
import { useDataStore } from "@/stores/data-store";
import { useRetroDataStore } from "@/stores/retro-data-store";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_MAIN_WIDTH = 560;
const COLLAPSE_THRESHOLD = 96;

interface SidebarResizeState {
  handle: "left" | "right";
  startX: number;
  startWidth: number;
  containerWidth: number;
  oppositeWidth: number;
}

interface SidebarResizeDraft {
  handle: "left" | "right";
  collapsed: boolean;
  width: number;
  guideX: number;
}

export default function Page() {
  const { session, login, logout, isLoading, error, authBypassEnabled } =
    useAuth();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizeGuideRef = useRef<HTMLDivElement | null>(null);
  const pendingResizeRef = useRef<SidebarResizeDraft | null>(null);
  const restoreAttemptRef = useRef<string | null>(null);
  const retroRestoreAttemptRef = useRef<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeMode, setActiveMode] = useState<AppMode>("daily");
  const [guideMode, setGuideMode] = useState<ChartGuideMode>("series");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [sidebarResize, setSidebarResize] = useState<SidebarResizeState | null>(
    null,
  );

  const {
    files,
    selectedFileId,
    fileDetails,
    testTypes,
    selectedTestIds,
    selectedObjectKeys,
    dateRange,
    chartData,
    isChartLoading,
    parseProgress,
    searchQuery,
    showAverage,
    statusMessage,
    chartOptimization,
    setSelectedTestIds,
    setSelectedObjectKeys,
    setDateRange,
    setSearchQuery,
    setParseProgress,
    setStatusMessage,
    setArchiveSummary,
    setFiles,
    setTestTypes,
    setChartOptimization,
    setChartTrendline,
    chartTrendline,
  } = useDataStore();

  const { selectArchive, openArchiveByPath, loadFileDetails, rescan } =
    useArchive();
  useChartData();

  const {
    files: retroFiles,
    selectedFileId: retroSelectedFileId,
    fileDetails: retroFileDetails,
    testTypes: retroTestTypes,
    allTestTypes: retroAllTestTypes,
    selectedTestIds: retroSelectedTestIds,
    dateRange: retroDateRange,
    chartData: retroChartData,
    isChartLoading: retroIsChartLoading,
    parseProgress: retroParseProgress,
    searchQuery: retroSearchQuery,
    statusMessage: retroStatusMessage,
    periods: retroPeriods,
    overlayEnabled: retroOverlayEnabled,
    setSelectedTestIds: setRetroSelectedTestIds,
    setDateRange: setRetroDateRange,
    setSearchQuery: setRetroSearchQuery,
    setParseProgress: setRetroParseProgress,
    setStatusMessage: setRetroStatusMessage,
    setArchiveSummary: setRetroArchiveSummary,
    setFiles: setRetroFiles,
    setTestTypes: setRetroTestTypes,
    setAllTestTypes: setRetroAllTestTypes,
    setPeriods: setRetroPeriods,
    setOverlayEnabled: setRetroOverlayEnabled,
  } = useRetroDataStore();

  const { selectRetroArchive, openRetroArchiveByPath, loadRetroFileDetails, rescanRetroArchive } =
    useRetroArchive();
  useRetroChartData();

  useTauriEvent(
    api.onParseProgress,
    useCallback((payload) => setParseProgress(payload), [setParseProgress]),
  );
  useTauriEvent(
    api.onParseComplete,
    useCallback(
      async (payload) => {
        setArchiveSummary(payload);
        if (!session) {
          return;
        }

        const [nextFiles, nextTests] = await Promise.all([
          api.getFileList(session.token, payload.archiveId),
          api.getTestTypes(session.token, payload.archiveId),
        ]);

        setFiles(nextFiles);
        setTestTypes(nextTests);
        setSelectedTestIds(
          nextTests[0]
            ? [nextTests[0].id]
            : [],
        );
      },
      [
        session,
        setArchiveSummary,
        setFiles,
        setSelectedTestIds,
        setTestTypes,
      ],
    ),
  );
  useTauriEvent(
    api.onFileChanged,
    useCallback(
      (payload) => {
        setStatusMessage(`Файл ${payload.action}: ${payload.filename}`);
      },
      [setStatusMessage],
    ),
  );

  useTauriEvent(
    api.onRetroParseProgress,
    useCallback((payload) => setRetroParseProgress(payload), [setRetroParseProgress]),
  );
  useTauriEvent(
    api.onRetroParseComplete,
    useCallback(
      async (payload) => {
        setRetroArchiveSummary(payload);
        if (!session) {
          return;
        }

        const [nextFiles, allTests] = await Promise.all([
          api.getRetroFileList(session.token, payload.archiveId),
          api.getRetroTestTypes(session.token, payload.archiveId),
        ]);

        setRetroFiles(nextFiles);
        setRetroAllTestTypes(allTests);

        // The sidebar lists one sheet's parameters, so a background rescan
        // reloads the parameters of the sheet that is open (or the first
        // one) rather than dumping the whole archive into the list.
        const targetFileId =
          useRetroDataStore.getState().selectedFileId ?? nextFiles[0]?.id ?? null;
        if (targetFileId === null) {
          setRetroTestTypes([]);
          setRetroSelectedTestIds([]);
          return;
        }

        const fileTests = await api.getRetroTestTypes(session.token, undefined, targetFileId);
        setRetroTestTypes(fileTests);
        const stillValid = new Set(allTests.map((test) => test.id));
        const preserved = useRetroDataStore
          .getState()
          .selectedTestIds.filter((id) => stillValid.has(id));
        setRetroSelectedTestIds(
          preserved.length > 0 ? preserved : fileTests[0] ? [fileTests[0].id] : [],
        );
      },
      [
        session,
        setRetroAllTestTypes,
        setRetroArchiveSummary,
        setRetroFiles,
        setRetroSelectedTestIds,
        setRetroTestTypes,
      ],
    ),
  );

  useEffect(() => {
    if (!session) {
      restoreAttemptRef.current = null;
      return;
    }

    if (restoreAttemptRef.current === session.token) {
      return;
    }
    restoreAttemptRef.current = session.token;

    let cancelled = false;
    const restore = async () => {
      try {
        const path = await api.getLastArchivePath(session.token);
        if (!path || cancelled) {
          return;
        }
        await openArchiveByPath(path, { silent: true });
        if (!cancelled) {
          setStatusMessage(`Восстановлен архив: ${path}`);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Не удалось восстановить последний архив";
          setStatusMessage(message);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [openArchiveByPath, session, setStatusMessage]);
  useTauriEvent(
    api.onFileError,
    useCallback((payload) => {
      toast.error(`Ошибка файла ${payload.filename}: ${payload.error}`);
    }, []),
  );

  useEffect(() => {
    if (!session) {
      retroRestoreAttemptRef.current = null;
      return;
    }

    if (retroRestoreAttemptRef.current === session.token) {
      return;
    }
    retroRestoreAttemptRef.current = session.token;

    let cancelled = false;
    const restore = async () => {
      try {
        const path = await api.getLastRetroArchivePath(session.token);
        if (!path || cancelled) {
          return;
        }
        await openRetroArchiveByPath(path, { silent: true });
        if (!cancelled) {
          setRetroStatusMessage(`Восстановлен ретроспективный архив: ${path}`);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Не удалось восстановить последний ретроспективный архив";
          setRetroStatusMessage(message);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [openRetroArchiveByPath, session, setRetroStatusMessage]);

  const availableObjects = useAvailableObjects(fileDetails?.objects, chartData?.objects, files);
  const availableDates = useAvailableDates(files.map((file) => file.date));

  // Retro mode has no object dimension — the chart's single synthetic
  // object (see `RETRO_OBJECT_KEY`) is whatever the query came back with,
  // and every series belongs to it.
  const retroObjectKeys = useMemo(
    () => retroChartData?.objects.map((object) => object.objectKey) ?? [],
    [retroChartData],
  );
  // Retro archives have no single per-file calendar date; period presets
  // are derived from whatever data the currently selected test(s) cover.
  const retroAvailableDates = useAvailableDates(retroChartData?.points.map((point) => point.date) ?? []);

  const {
    visibleTestTypes,
    parameterLinks,
    pendingLinkTestId,
    handleToggleParameterLink,
  } = useParameterLinks(testTypes, selectedTestIds, setSelectedTestIds);

  // The sidebar lists the selected sheet's parameters, plus — under their
  // own heading — parameters still selected from another sheet, so they can
  // be seen and unchecked (an inlet/outlet comparison always spans two
  // sheets, since one sheet is one sampling point).
  const retroForeignSelectedTests = useMemo(() => {
    const own = new Set(retroTestTypes.map((test) => test.id));
    return retroAllTestTypes.filter(
      (test) => !own.has(test.id) && retroSelectedTestIds.includes(test.id),
    );
  }, [retroAllTestTypes, retroSelectedTestIds, retroTestTypes]);

  const retroSidebarTestTypes = useMemo(
    () => [...retroTestTypes, ...retroForeignSelectedTests],
    [retroForeignSelectedTests, retroTestTypes],
  );

  const retroForeignSelectedTestIds = useMemo(
    () => retroForeignSelectedTests.map((test) => test.id),
    [retroForeignSelectedTests],
  );

  const {
    visibleTestTypes: retroVisibleTestTypes,
    parameterLinks: retroParameterLinks,
    pendingLinkTestId: retroPendingLinkTestId,
    handleToggleParameterLink: handleToggleRetroParameterLink,
  } = useParameterLinks(retroSidebarTestTypes, retroSelectedTestIds, setRetroSelectedTestIds);

  const refreshLicenseStatus = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLicenseStatus({
        required: false,
        active: true,
        fingerprint: "browser-dev",
        customerName: null,
        licenseId: null,
        expiresAt: null,
        source: null,
        message: "Лицензирование отключено в браузерном режиме разработки",
      });
      setLicenseLoading(false);
      return;
    }

    setLicenseLoading(true);
    setLicenseError(null);
    try {
      const nextStatus = await api.getLicenseStatus();
      setLicenseStatus(nextStatus);
    } catch (error) {
      setLicenseError(
        error instanceof Error ? error.message : "Не удалось проверить лицензию",
      );
    } finally {
      setLicenseLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLicenseStatus();
  }, [refreshLicenseStatus]);

  const handleOnlineLicenseActivation = useCallback(
    async (licenseKey: string) => {
      setLicenseLoading(true);
      setLicenseError(null);
      try {
        const nextStatus = await api.activateLicenseOnline(licenseKey);
        setLicenseStatus(nextStatus);
        toast.success("Лицензия активирована");
      } catch (error) {
        setLicenseError(getErrorMessage(error, "Не удалось активировать лицензию"));
      } finally {
        setLicenseLoading(false);
      }
    },
    [],
  );

  const handleOfflineLicenseActivation = useCallback(
    async (token: string) => {
      setLicenseLoading(true);
      setLicenseError(null);
      try {
        const nextStatus = await api.activateLicenseOffline(token);
        setLicenseStatus(nextStatus);
        toast.success("Лицензия активирована");
      } catch (error) {
        setLicenseError(getErrorMessage(error, "Не удалось активировать лицензию"));
      } finally {
        setLicenseLoading(false);
      }
    },
    [],
  );

  const { effectiveSelectedTestIds, effectiveSelectedObjectKeys } = useEffectiveSelection(
    selectedTestIds,
    visibleTestTypes,
    setSelectedTestIds,
    selectedObjectKeys,
    availableObjects,
  );

  const { effectiveSelectedTestIds: retroEffectiveSelectedTestIds } = useEffectiveSelection(
    retroSelectedTestIds,
    retroVisibleTestTypes,
    setRetroSelectedTestIds,
  );

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      await login(username, password);
      setStatusMessage("Успешная авторизация");
    },
    [login, setStatusMessage],
  );

  useEffect(() => {
    if (!chartTrendline.enabled && guideMode === "average") {
      setGuideMode("series");
    }
  }, [chartTrendline.enabled, guideMode]);

  const handleExportExcel = useCallback(() => {
    void exportChartExcel(session, chartData, effectiveSelectedTestIds, effectiveSelectedObjectKeys);
  }, [chartData, effectiveSelectedObjectKeys, effectiveSelectedTestIds, session]);

  const handleExportRetroExcel = useCallback(() => {
    void exportChartExcel(session, retroChartData, retroEffectiveSelectedTestIds, retroObjectKeys);
  }, [retroChartData, retroEffectiveSelectedTestIds, retroObjectKeys, session]);

  const handleExportPng = useCallback(() => {
    void (async () => {
      const element = document.getElementById("time-series-chart");
      if (!element) {
        toast.error("График не найден");
        return;
      }

      try {
        const png = await toPng(element, { cacheBust: true, pixelRatio: 2 });
        const fileName = buildExportDefaultName("chart", "png");

        if (session && isTauriRuntime()) {
          const targetPath = await pickExportPath("Сохранить PNG", fileName, [
            { name: "PNG", extensions: ["png"] },
          ]);
          if (!targetPath) {
            return;
          }

          const bytes = Array.from(dataUrlToBytes(png));
          await api.saveExportFile(session.token, targetPath, bytes);
        } else {
          const link = document.createElement("a");
          link.href = png;
          link.download = fileName;
          link.click();
        }

        toast.success("PNG экспортирован");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Не удалось экспортировать PNG";
        toast.error(message);
      }
    })();
  }, [session]);

  const handlePrintChart = useCallback(async () => {
    const element = document.getElementById("time-series-chart");
    if (!element) {
      toast.error("График не найден");
      return;
    }

    try {
      const png = await toPng(element, { cacheBust: true, pixelRatio: 2 });
      const printRoot = document.createElement("div");
      printRoot.className = "chart-print-root";
      printRoot.innerHTML = `<img src="${png}" alt="Chart print" />`;
      document.body.appendChild(printRoot);
      document.body.classList.add("printing-chart-only");

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        document.body.classList.remove("printing-chart-only");
        printRoot.remove();
      };

      const onAfterPrint = () => cleanup();
      window.addEventListener("afterprint", onAfterPrint, { once: true });

      setTimeout(() => {
        try {
          window.print();
        } catch {
          cleanup();
          toast.error("Не удалось открыть диалог печати");
        }
      }, 0);

      setTimeout(cleanup, 15000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось подготовить печать";
      toast.error(message);
    }
  }, []);

  // Period overlay (see src/lib/period-overlay.ts): turns several time
  // slices of the same parameter into pseudo-objects on one ChartDataset,
  // so the chart/statistics/trendline machinery below renders it exactly
  // like a normal multi-object query. Retro-only — a retro parameter has an
  // archive-wide monthly grid that makes "2023 vs 2024" a meaningful
  // comparison; daily mode has no equivalent notion of comparable slices
  // (see the `PeriodControl` prop doc comments), so it never builds one.
  const retroOverlay = useMemo(() => {
    if (!retroOverlayEnabled || retroPeriods.length === 0 || !retroChartData) {
      return null;
    }
    return buildPeriodOverlayDataset(retroChartData, retroPeriods);
  }, [retroChartData, retroOverlayEnabled, retroPeriods]);

  const retroPhaseFormatter = useCallback((value: string) => formatPhaseLabel(value, "month"), []);

  const effectiveRetroChartData = retroOverlay?.dataset ?? retroChartData;

  // When overlay is active, `effectiveRetroChartData` is keyed by
  // pseudo-objects ("objectKey::periodId"), not the real selection — the
  // chart/table must be told to look for those pseudo-keys, or every series
  // comes up empty.
  const retroChartSelectedObjectKeys = retroOverlay
    ? retroOverlay.dataset.objects.map((object) => object.objectKey)
    : retroObjectKeys;

  const retroEfficiencyGroups = useMemo(
    () =>
      retroOverlay ? buildPeriodEfficiencyGroups(retroObjectKeys, retroPeriods) : undefined,
    [retroOverlay, retroObjectKeys, retroPeriods],
  );

  const moveResizeGuide = useCallback((x: number) => {
    const line = resizeGuideRef.current;
    if (!line) {
      return;
    }
    line.style.transform = `translateX(${Math.round(x)}px)`;
  }, []);

  const startSidebarResize = useCallback(
    (handle: "left" | "right", event: ReactMouseEvent<HTMLDivElement>) => {
      if (window.innerWidth < 1280) {
        return;
      }

      const container = layoutRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const isCollapsed =
        handle === "left" ? leftPanelCollapsed : rightPanelCollapsed;
      const currentWidth = handle === "left" ? leftPanelWidth : rightPanelWidth;
      const oppositeWidth =
        handle === "left"
          ? rightPanelCollapsed
            ? 0
            : rightPanelWidth
          : leftPanelCollapsed
            ? 0
            : leftPanelWidth;

      const resizeState: SidebarResizeState = {
        handle,
        startX: event.clientX,
        startWidth: isCollapsed ? 0 : currentWidth,
        containerWidth: rect.width,
        oppositeWidth,
      };
      setSidebarResize(resizeState);
      pendingResizeRef.current = resolveResizeDraft(resizeState, event.clientX);
      event.preventDefault();
    },
    [leftPanelCollapsed, leftPanelWidth, rightPanelCollapsed, rightPanelWidth],
  );

  useEffect(() => {
    if (!sidebarResize) {
      return;
    }
    const activeResize = sidebarResize;
    const initialDraft =
      pendingResizeRef.current ??
      resolveResizeDraft(activeResize, activeResize.startX);
    pendingResizeRef.current = initialDraft;
    moveResizeGuide(initialDraft.guideX);
  }, [moveResizeGuide, sidebarResize]);

  useEffect(() => {
    if (!sidebarResize) {
      return;
    }
    const activeResize = sidebarResize;

    function onMove(event: MouseEvent) {
      const nextDraft = resolveResizeDraft(activeResize, event.clientX);
      pendingResizeRef.current = nextDraft;
      moveResizeGuide(nextDraft.guideX);
    }

    function onUp() {
      const finalDraft = pendingResizeRef.current;
      if (finalDraft) {
        if (finalDraft.handle === "left") {
          setLeftPanelCollapsed(finalDraft.collapsed);
          setLeftPanelWidth(finalDraft.width);
        } else {
          setRightPanelCollapsed(finalDraft.collapsed);
          setRightPanelWidth(finalDraft.width);
        }
      }
      pendingResizeRef.current = null;
      setSidebarResize(null);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [moveResizeGuide, sidebarResize]);

  useEffect(() => {
    function fitPanelWidths() {
      if (window.innerWidth < 1280) {
        return;
      }

      const container = layoutRef.current;
      if (!container) {
        return;
      }

      const totalWidth = container.clientWidth;
      const effectiveRight = rightPanelCollapsed ? 0 : rightPanelWidth;

      if (!leftPanelCollapsed) {
        const max = getMaxSidebarWidth(totalWidth, effectiveRight);
        if (max < MIN_SIDEBAR_WIDTH) {
          setLeftPanelCollapsed(true);
          setLeftPanelWidth(0);
        } else {
          const nextLeft = clamp(leftPanelWidth, MIN_SIDEBAR_WIDTH, max);
          if (nextLeft !== leftPanelWidth) {
            setLeftPanelWidth(nextLeft);
            return;
          }
        }
      }

      if (!rightPanelCollapsed) {
        const leftNow = leftPanelCollapsed ? 0 : leftPanelWidth;
        const max = getMaxSidebarWidth(totalWidth, leftNow);
        if (max < MIN_SIDEBAR_WIDTH) {
          setRightPanelCollapsed(true);
          setRightPanelWidth(0);
        } else {
          const nextRight = clamp(rightPanelWidth, MIN_SIDEBAR_WIDTH, max);
          if (nextRight !== rightPanelWidth) {
            setRightPanelWidth(nextRight);
          }
        }
      }
    }

    fitPanelWidths();
    window.addEventListener("resize", fitPanelWidths);
    return () => window.removeEventListener("resize", fitPanelWidths);
  }, [
    leftPanelCollapsed,
    leftPanelWidth,
    rightPanelCollapsed,
    rightPanelWidth,
  ]);

  const leftSidebarStyle = useMemo(
    () => ({ "--left-panel-width": `${leftPanelWidth}px` }) as CSSProperties,
    [leftPanelWidth],
  );
  const rightSidebarStyle = useMemo(
    () => ({ "--right-panel-width": `${rightPanelWidth}px` }) as CSSProperties,
    [rightPanelWidth],
  );

  if (licenseLoading && !licenseStatus) {
    return (
      <AuthProvider>
        <div className="flex min-h-screen items-center justify-center bg-[#f1f3f5] px-4">
          <div className="w-full max-w-md border border-ink/25 bg-white p-6 text-center">
            <div className="mb-6 flex justify-center">
              <Spinner size="lg" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
              Water Lab Analytics
            </p>
            <h1 className="mt-2 text-xl font-semibold text-ink">
              Проверка лицензии
            </h1>
          </div>
        </div>
      </AuthProvider>
    );
  }

  if (licenseStatus?.required && !licenseStatus.active) {
    return (
      <AuthProvider>
        <LicenseActivationScreen
          status={licenseStatus}
          loading={licenseLoading}
          error={licenseError}
          onOnlineActivate={handleOnlineLicenseActivation}
          onOfflineActivate={handleOfflineLicenseActivation}
          onRefresh={refreshLicenseStatus}
        />
      </AuthProvider>
    );
  }

  if (!session) {
    if (authBypassEnabled || AUTH_BYPASS_ENABLED) {
      return (
        <AuthProvider>
          <div className="flex min-h-screen items-center justify-center bg-[#f1f3f5] px-4">
            <div className="w-full max-w-md border border-ink/25 bg-white p-6 text-center">
              <div className="mb-6 flex justify-center">
                <Spinner size="lg" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
                Система Анализатор
              </p>
              <h1 className="mt-2 text-xl font-semibold text-ink">
                Запуск приложения
              </h1>
              <p className="mt-3 text-sm text-ink/70">
                Авторизация выполнится автоматически.
              </p>
              {error && (
                <div className="mt-4 border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-ember">
                  {error}
                </div>
              )}
            </div>
          </div>
        </AuthProvider>
      );
    }

    return (
      <AuthProvider>
        <div className="flex min-h-screen items-center justify-center bg-[#f1f3f5] px-4">
          <LoginForm loading={isLoading} error={error} onSubmit={handleLogin} />
        </div>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#f1f3f5] p-3">
        <header className="mb-3 flex shrink-0 items-start justify-between gap-2 border border-ink/20 bg-white px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <ModeSwitcher mode={activeMode} onChange={setActiveMode} />
            <h1 className="text-lg font-semibold text-ink">
              {activeMode === "daily"
                ? "Модуль обработки параметров лабораторного контроля"
                : "Модуль ретроспективного анализа"}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <InterfaceSettingsMenu />
            {!authBypassEnabled && (
              <Button variant="danger" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Выход
              </Button>
            )}
          </div>
        </header>

        <div
          ref={layoutRef}
          className="relative flex min-h-0 flex-1 flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-0"
        >
          {leftPanelCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="absolute left-0 top-0 hidden h-full w-2 cursor-col-resize xl:block"
              onMouseDown={(event) => startSidebarResize("left", event)}
              title="Потяните от края, чтобы показать левую панель"
            />
          )}

          {rightPanelCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="absolute right-0 top-0 hidden h-full w-2 cursor-col-resize xl:block"
              onMouseDown={(event) => startSidebarResize("right", event)}
              title="Потяните от края, чтобы показать правую панель"
            />
          )}

          {sidebarResize && (
            <div
              ref={resizeGuideRef}
              className="pointer-events-none absolute bottom-0 top-0 z-20 hidden w-[2px] bg-ink/60 xl:block"
              style={{ left: 0 }}
            />
          )}

          <div
            className={`w-full xl:h-full xl:min-h-0 xl:shrink-0 ${
              leftPanelCollapsed
                ? "xl:hidden"
                : "xl:w-[var(--left-panel-width)]"
            }`}
            style={leftSidebarStyle}
          >
            {activeMode === "daily" ? (
              <Sidebar
                files={files}
                selectedFileId={selectedFileId}
                detailsSlot={<FileDetails details={fileDetails} />}
                searchQuery={searchQuery}
                onSearchQuery={setSearchQuery}
                onSelectFile={loadFileDetails}
                onPickArchive={selectArchive}
                onRescan={rescan}
              />
            ) : (
              <Sidebar
                files={retroFiles}
                selectedFileId={retroSelectedFileId}
                detailsSlot={<RetroFileDetailsPanel details={retroFileDetails} />}
                searchQuery={retroSearchQuery}
                onSearchQuery={setRetroSearchQuery}
                onSelectFile={loadRetroFileDetails}
                onPickArchive={selectRetroArchive}
                onRescan={rescanRetroArchive}
                pickArchiveLabel="Выбрать ретро-архив"
              />
            )}
          </div>

          {!leftPanelCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="hidden xl:block xl:w-2 xl:shrink-0 xl:cursor-col-resize"
              onMouseDown={(event) => startSidebarResize("left", event)}
              title="Изменить ширину левой панели"
            />
          )}

          {activeMode === "daily" ? (
            <MainArea
              selectedTestIds={effectiveSelectedTestIds}
              selectedObjectKeys={effectiveSelectedObjectKeys}
              parameterLinks={parameterLinks}
              availableDates={availableDates}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              chartData={chartData}
              isChartLoading={isChartLoading}
              showAverage={showAverage}
              guideMode={guideMode}
              chartOptimization={chartOptimization}
              chartTrendline={chartTrendline}
              parseProgress={parseProgress}
              statusMessage={statusMessage}
              onExportExcel={handleExportExcel}
              onExportPng={handleExportPng}
              onPrintChart={handlePrintChart}
            />
          ) : (
            <MainArea
              selectedTestIds={retroEffectiveSelectedTestIds}
              selectedObjectKeys={retroChartSelectedObjectKeys}
              parameterLinks={retroParameterLinks}
              availableDates={retroAvailableDates}
              dateRange={retroDateRange}
              onDateRangeChange={setRetroDateRange}
              periods={retroPeriods}
              onPeriodsChange={setRetroPeriods}
              overlayEnabled={retroOverlayEnabled}
              onOverlayEnabledChange={setRetroOverlayEnabled}
              chartData={effectiveRetroChartData}
              isChartLoading={retroIsChartLoading}
              showAverage={showAverage}
              guideMode={guideMode}
              chartOptimization={chartOptimization}
              chartTrendline={chartTrendline}
              parseProgress={retroParseProgress}
              statusMessage={retroStatusMessage}
              onExportExcel={handleExportRetroExcel}
              onExportPng={handleExportPng}
              onPrintChart={handlePrintChart}
              xTickFormatter={retroOverlay ? retroPhaseFormatter : undefined}
              dateFormatter={retroOverlay ? retroPhaseFormatter : undefined}
              efficiencyGroups={retroEfficiencyGroups}
            />
          )}

          {!rightPanelCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="hidden xl:block xl:w-2 xl:shrink-0 xl:cursor-col-resize"
              onMouseDown={(event) => startSidebarResize("right", event)}
              title="Изменить ширину правой панели"
            />
          )}

          <div
            className={`w-full xl:h-full xl:min-h-0 xl:shrink-0 ${
              rightPanelCollapsed
                ? "xl:hidden"
                : "xl:w-[var(--right-panel-width)]"
            }`}
            style={rightSidebarStyle}
          >
            {activeMode === "daily" ? (
              <RightSidebar
                testTypes={visibleTestTypes}
                selectedTestIds={effectiveSelectedTestIds}
                onSelectTests={setSelectedTestIds}
                parameterLinks={parameterLinks}
                pendingLinkTestId={pendingLinkTestId}
                onToggleParameterLink={handleToggleParameterLink}
                availableObjects={availableObjects}
                selectedObjectKeys={effectiveSelectedObjectKeys}
                onChangeObjects={setSelectedObjectKeys}
                guideMode={guideMode}
                onGuideModeChange={setGuideMode}
                optimization={chartOptimization}
                trendline={chartTrendline}
                pointCount={chartData?.points.length ?? 0}
                onOptimizationChange={setChartOptimization}
                onTrendlineChange={setChartTrendline}
              />
            ) : (
              <RightSidebar
                testTypes={retroVisibleTestTypes}
                selectedTestIds={retroEffectiveSelectedTestIds}
                onSelectTests={setRetroSelectedTestIds}
                parameterLinks={retroParameterLinks}
                pendingLinkTestId={retroPendingLinkTestId}
                onToggleParameterLink={handleToggleRetroParameterLink}
                secondaryTestIds={retroForeignSelectedTestIds}
                secondaryTestsLabel="Выбрано в других файлах"
                guideMode={guideMode}
                onGuideModeChange={setGuideMode}
                optimization={chartOptimization}
                trendline={chartTrendline}
                pointCount={retroChartData?.points.length ?? 0}
                onOptimizationChange={setChartOptimization}
                onTrendlineChange={setChartTrendline}
              />
            )}
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMaxSidebarWidth(
  containerWidth: number,
  oppositeSidebarWidth: number,
): number {
  const maxByLayout =
    containerWidth - oppositeSidebarWidth - MIN_MAIN_WIDTH - 12;
  return Math.max(0, Math.min(MAX_SIDEBAR_WIDTH, maxByLayout));
}

function resolveResizeDraft(
  resize: SidebarResizeState,
  clientX: number,
): SidebarResizeDraft {
  const delta = clientX - resize.startX;
  const draftWidth =
    resize.startWidth + (resize.handle === "left" ? delta : -delta);
  const max = getMaxSidebarWidth(resize.containerWidth, resize.oppositeWidth);
  const canShow = max >= MIN_SIDEBAR_WIDTH;
  const collapsed = !canShow || draftWidth <= COLLAPSE_THRESHOLD;
  const width = collapsed ? 0 : clamp(draftWidth, MIN_SIDEBAR_WIDTH, max);
  const guideX =
    resize.handle === "left" ? width : resize.containerWidth - width;

  return {
    handle: resize.handle,
    collapsed,
    width,
    guideX,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}


