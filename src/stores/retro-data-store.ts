'use client';

import { create } from 'zustand';

import type {
  ArchiveSummary,
  ChartDataset,
  DateRange,
  OverlayPeriod,
  ParseProgress,
  RetroFileDetails,
  RetroFileInfo,
  TestType
} from '@/lib/types';

/**
 * State for the retrospective ("retro") mode. Mirrors the shape of
 * `data-store.ts` (the daily/everyday mode) closely so both modes can drive
 * the same Sidebar/MainArea/RightSidebar components — see src/app/page.tsx.
 * The one deliberate difference: there is no object selection here. A retro
 * sheet is a single sampling point, so the chart is driven by the parameter
 * selection alone (see `RETRO_OBJECT_KEY` on the Rust side). Kept as a fully separate store (rather than a slice of
 * the daily store) so switching tabs never clobbers the other mode's
 * selection state.
 *
 * Display-only settings that are not tied to a specific dataset
 * (`chartOptimization`, `chartTrendline`, `showAverage`) intentionally stay
 * in the daily store and are reused as-is for retro mode.
 */
interface RetroDataStore {
  archiveSummary: ArchiveSummary | null;
  files: RetroFileInfo[];
  selectedFileId: number | null;
  fileDetails: RetroFileDetails | null;
  /** Parameters of the selected file — what the sidebar lists. */
  testTypes: TestType[];
  /**
   * Every parameter in the archive. Only used to resolve parameters that
   * are still selected from a previously opened sheet, so switching files
   * never silently drops a series from the chart (that is what makes an
   * inlet-vs-outlet comparison possible, since the two live in different
   * sheets).
   */
  allTestTypes: TestType[];
  selectedTestIds: number[];
  dateRange: DateRange;
  chartData: ChartDataset | null;
  isChartLoading: boolean;
  parseProgress: ParseProgress | null;
  isBusy: boolean;
  searchQuery: string;
  statusMessage: string | null;
  periods: OverlayPeriod[];
  overlayEnabled: boolean;
  setArchiveSummary: (summary: ArchiveSummary | null) => void;
  setFiles: (files: RetroFileInfo[]) => void;
  setSelectedFileId: (fileId: number | null) => void;
  setFileDetails: (details: RetroFileDetails | null) => void;
  setTestTypes: (types: TestType[]) => void;
  setAllTestTypes: (types: TestType[]) => void;
  setSelectedTestIds: (ids: number[]) => void;
  setDateRange: (range: DateRange) => void;
  setChartData: (dataset: ChartDataset | null) => void;
  setChartLoading: (loading: boolean) => void;
  setParseProgress: (progress: ParseProgress | null) => void;
  setBusy: (busy: boolean) => void;
  setSearchQuery: (query: string) => void;
  setStatusMessage: (message: string | null) => void;
  setPeriods: (periods: OverlayPeriod[]) => void;
  setOverlayEnabled: (enabled: boolean) => void;
  resetRetroData: () => void;
}

const initialDateRange: DateRange = {
  from: null,
  to: null
};

export const useRetroDataStore = create<RetroDataStore>((set) => ({
  archiveSummary: null,
  files: [],
  selectedFileId: null,
  fileDetails: null,
  testTypes: [],
  allTestTypes: [],
  selectedTestIds: [],
  dateRange: initialDateRange,
  chartData: null,
  isChartLoading: false,
  parseProgress: null,
  isBusy: false,
  searchQuery: '',
  statusMessage: null,
  periods: [],
  overlayEnabled: false,
  setArchiveSummary: (archiveSummary) => set({ archiveSummary }),
  setFiles: (files) => set({ files }),
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
  setFileDetails: (fileDetails) => set({ fileDetails }),
  setTestTypes: (testTypes) => set({ testTypes }),
  setAllTestTypes: (allTestTypes) => set({ allTestTypes }),
  setSelectedTestIds: (selectedTestIds) => set({ selectedTestIds }),
  setDateRange: (dateRange) => set({ dateRange }),
  setChartData: (chartData) => set({ chartData }),
  setChartLoading: (isChartLoading) => set({ isChartLoading }),
  setParseProgress: (parseProgress) => set({ parseProgress }),
  setBusy: (isBusy) => set({ isBusy }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setPeriods: (periods) => set({ periods }),
  setOverlayEnabled: (overlayEnabled) => set({ overlayEnabled }),
  resetRetroData: () =>
    set({
      archiveSummary: null,
      files: [],
      selectedFileId: null,
      fileDetails: null,
      testTypes: [],
      allTestTypes: [],
      selectedTestIds: [],
      dateRange: initialDateRange,
      chartData: null,
      isChartLoading: false,
      parseProgress: null,
      isBusy: false,
      searchQuery: '',
      statusMessage: null,
      periods: [],
      overlayEnabled: false
    })
}));
