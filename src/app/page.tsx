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
import { MainArea } from "@/components/layout/MainArea";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { useArchive } from "@/hooks/useArchive";
import { useAuth } from "@/hooks/useAuth";
import { useChartData } from "@/hooks/useChartData";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { api, isTauriRuntime, pickExportPath } from "@/lib/tauri-api";
import type {
  ChartDataset,
  ChartObject,
  ChartTest,
  ChartGuideMode,
  ExcelCellValue,
  ExcelExportPayload,
} from "@/lib/types";
import { useDataStore } from "@/stores/data-store";

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
  const { session, login, logout, isLoading, error } = useAuth();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizeGuideRef = useRef<HTMLDivElement | null>(null);
  const pendingResizeRef = useRef<SidebarResizeDraft | null>(null);
  const restoreAttemptRef = useRef<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [guideMode, setGuideMode] = useState<ChartGuideMode>("series");
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
    parseProgress,
    searchQuery,
    showAverage,
    statusMessage,
    chartOptimization,
    setSelectedTestIds,
    setSelectedObjectKeys,
    setDateRange,
    setSearchQuery,
    setShowAverage,
    setParseProgress,
    setStatusMessage,
    setArchiveSummary,
    setFiles,
    setTestTypes,
    setChartOptimization,
  } = useDataStore();

  const { selectArchive, openArchiveByPath, loadFileDetails, rescan } =
    useArchive();
  useChartData();

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
          api.getTestTypes(session.token),
        ]);

        setFiles(nextFiles);
        setTestTypes(nextTests);
        const preserved = selectedTestIds.filter((id) =>
          nextTests.some((item) => item.id === id),
        );
        setSelectedTestIds(
          preserved.length > 0
            ? preserved
            : nextTests[0]
              ? [nextTests[0].id]
              : [],
        );
      },
      [
        selectedTestIds,
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

  const availableObjects = useMemo(() => {
    if (chartData?.objects && chartData.objects.length > 0) {
      return chartData.objects.map((item) => ({
        key: item.objectKey,
        label: item.objectLabel,
        order: item.objectOrder,
      }));
    }
    if (fileDetails?.objects && fileDetails.objects.length > 0) {
      return fileDetails.objects;
    }

    const maxObjectCount = files.reduce(
      (max, file) => Math.max(max, file.objectCount),
      0,
    );
    return Array.from({ length: maxObjectCount }, (_, index) => ({
      key: String(index + 1),
      label: String(index + 1),
      order: index + 1,
    }));
  }, [chartData?.objects, fileDetails?.objects, files]);

  const availableDates = useMemo(() => {
    const unique = new Set(files.map((file) => file.date));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const effectiveSelectedTestIds = useMemo(() => {
    const available = new Set(testTypes.map((item) => item.id));
    if (selectedTestIds.length === 0) {
      return [];
    }
    const filtered = selectedTestIds.filter((id) => available.has(id));
    if (filtered.length > 0) {
      return filtered;
    }
    return testTypes[0] ? [testTypes[0].id] : [];
  }, [selectedTestIds, testTypes]);

  const effectiveSelectedObjectKeys = useMemo(() => {
    const available = new Set(availableObjects.map((item) => item.key));
    return selectedObjectKeys.filter((key) => available.has(key));
  }, [availableObjects, selectedObjectKeys]);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      await login(username, password);
      setStatusMessage("Успешная авторизация");
    },
    [login, setStatusMessage],
  );

  useEffect(() => {
    if (!showAverage && guideMode === "average") {
      setGuideMode("series");
    }
  }, [guideMode, showAverage]);

  const handleExportExcel = useCallback(() => {
    void (async () => {
      if (!chartData) {
        toast.error("Нет данных для экспорта");
        return;
      }

      const payload = buildChartExcelPayload(
        chartData,
        effectiveSelectedTestIds,
        effectiveSelectedObjectKeys,
      );

      try {
        if (session && isTauriRuntime()) {
          const fileName = buildExportDefaultName("chart_export", "xlsx");
          const targetPath = await pickExportPath("Сохранить Excel", fileName, [
            { name: "Excel", extensions: ["xlsx"] },
          ]);
          if (!targetPath) {
            return;
          }

          await api.saveExcelExport(session.token, targetPath, payload);
          toast.success("Excel экспортирован");
          return;
        }

        const fileName = buildExportDefaultName("chart_export", "xls");
        const blob = new Blob([buildBrowserExcelDocument(payload)], {
          type: "application/vnd.ms-excel;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Excel экспортирован");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Не удалось экспортировать Excel";
        toast.error(message);
      }
    })();
  }, [chartData, effectiveSelectedObjectKeys, effectiveSelectedTestIds, session]);

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

  if (!session) {
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
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border border-ink/20 bg-white px-4 py-3">
          <div className="flex h-full items-center">
            <h1 className="text-lg font-semibold text-ink">
              Модуль обработки параметров лабораторного контроля
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="danger" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Выход
            </Button>
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
            <Sidebar
              files={files}
              selectedFileId={selectedFileId}
              selectedFileDetails={fileDetails}
              searchQuery={searchQuery}
              onSearchQuery={setSearchQuery}
              onSelectFile={loadFileDetails}
              onPickArchive={selectArchive}
              onRescan={rescan}
            />
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

          <MainArea
            selectedTestIds={effectiveSelectedTestIds}
            selectedObjectKeys={effectiveSelectedObjectKeys}
            availableDates={availableDates}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            chartData={chartData}
            showAverage={showAverage}
            guideMode={guideMode}
            chartOptimization={chartOptimization}
            parseProgress={parseProgress}
            statusMessage={statusMessage}
            onExportExcel={handleExportExcel}
            onExportPng={handleExportPng}
            onPrintChart={handlePrintChart}
          />

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
            <RightSidebar
              testTypes={testTypes}
              selectedTestIds={effectiveSelectedTestIds}
              onSelectTests={setSelectedTestIds}
              availableObjects={availableObjects}
              selectedObjectKeys={effectiveSelectedObjectKeys}
              onChangeObjects={setSelectedObjectKeys}
              showAverage={showAverage}
              guideMode={guideMode}
              onToggleAverage={setShowAverage}
              onGuideModeChange={setGuideMode}
              optimization={chartOptimization}
              pointCount={chartData?.points.length ?? 0}
              onOptimizationChange={setChartOptimization}
            />
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

function buildExportDefaultName(prefix: string, extension: string): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return `${prefix}_${year}${month}${day}_${hour}${minute}${second}.${extension}`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function buildChartExcelPayload(
  chartData: ChartDataset,
  selectedTestIds: number[],
  selectedObjectKeys: string[],
): ExcelExportPayload {
  const tests =
    selectedTestIds.length === 0
      ? chartData.tests
      : chartData.tests.filter((test) => selectedTestIds.includes(test.testId));
  const objects =
    selectedObjectKeys.length === 0
      ? chartData.objects
      : chartData.objects.filter((object) =>
          selectedObjectKeys.includes(object.objectKey),
        );

  const headerRows = buildExcelHeaderRows(tests, objects);

  const rows = chartData.points.map((point) => {
    const row: ExcelCellValue[] = [point.date];

    for (const test of tests) {
      for (const object of objects) {
        const value =
          point.values.find(
            (item) =>
              item.testId === test.testId && item.objectKey === object.objectKey,
          )?.value ?? null;
        row.push(value);
      }
    }

    return row;
  });

  return {
    worksheetName: "Параметры",
    headerRows,
    rows,
  };
}

function buildBrowserExcelDocument(payload: ExcelExportPayload): string {
  const headerRows = payload.headerRows
    .map(
      (row) =>
        `<tr>${row.cells
          .map((cell) => `<th>${escapeHtml(String(cell))}</th>`)
          .join("")}</tr>`,
    )
    .join("");
  const bodyRows = payload.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(formatExcelCell(cell))}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return [
    "<html>",
    "<head>",
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    `<meta name="ProgId" content="Excel.Sheet" />`,
    "</head>",
    "<body>",
    '<table border="1">',
    `<thead>${headerRows}</thead>`,
    `<tbody>${bodyRows}</tbody>`,
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function formatExcelCell(value: ExcelCellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function buildExcelHeaderRows(
  tests: ChartTest[],
  objects: ChartObject[],
): ExcelExportPayload["headerRows"] {
  if (objects.length === 0) {
    return [
      {
        cells: ["Дата", ...tests.map((test) => test.testName)],
      },
    ];
  }

  return [
    {
      cells: ["Дата", ...tests.flatMap((test) => objects.map(() => test.testName))],
    },
    {
      cells: ["", ...tests.flatMap(() => objects.map((object) => object.objectLabel))],
    },
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

