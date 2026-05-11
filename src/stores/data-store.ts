'use client';

import { create } from 'zustand';

import type {
  ArchiveSummary,
  ChartDataset,
  ChartOptimizationSettings,
  ChartTrendlineSettings,
  DateRange,
  FileDetails,
  FileInfo,
  ParseProgress,
  TestType
} from '@/lib/types';

interface DataStore {
  archiveSummary: ArchiveSummary | null;
  files: FileInfo[];
  selectedFileId: number | null;
  fileDetails: FileDetails | null;
  testTypes: TestType[];
  selectedTestIds: number[];
  selectedObjectKeys: string[];
  dateRange: DateRange;
  chartData: ChartDataset | null;
  parseProgress: ParseProgress | null;
  isBusy: boolean;
  searchQuery: string;
  showAverage: boolean;
  statusMessage: string | null;
  chartOptimization: ChartOptimizationSettings;
  chartTrendline: ChartTrendlineSettings;
  setArchiveSummary: (summary: ArchiveSummary | null) => void;
  setFiles: (files: FileInfo[]) => void;
  setSelectedFileId: (fileId: number | null) => void;
  setFileDetails: (details: FileDetails | null) => void;
  setTestTypes: (types: TestType[]) => void;
  setSelectedTestIds: (ids: number[]) => void;
  setSelectedObjectKeys: (keys: string[]) => void;
  setDateRange: (range: DateRange) => void;
  setChartData: (dataset: ChartDataset | null) => void;
  setParseProgress: (progress: ParseProgress | null) => void;
  setBusy: (busy: boolean) => void;
  setSearchQuery: (query: string) => void;
  setShowAverage: (show: boolean) => void;
  setStatusMessage: (message: string | null) => void;
  setChartOptimization: (settings: Partial<ChartOptimizationSettings>) => void;
  setChartTrendline: (settings: Partial<ChartTrendlineSettings>) => void;
  resetData: () => void;
}

const initialDateRange: DateRange = {
  from: null,
  to: null
};

const initialOptimization: ChartOptimizationSettings = {
  autoOptimize: true,
  pointCompression: 1,
  lineApproximation: 'raw',
  averageApproximation: 'moving_average',
  movingAverageWindow: 3,
  emaAlpha: 0.35,
  averageMovingAverageWindow: 5,
  averageEmaAlpha: 0.25
};

const initialTrendline: ChartTrendlineSettings = {
  enabled: false,
  mode: 'linear',
  groupBy: 'test',
  polynomialDegree: 2,
  linearFilterWindow: 5,
  maWindow: 5,
  emaAlpha: 0.25,
  showEquation: true,
  showRSquared: true
};

export const useDataStore = create<DataStore>((set) => ({
  archiveSummary: null,
  files: [],
  selectedFileId: null,
  fileDetails: null,
  testTypes: [],
  selectedTestIds: [],
  selectedObjectKeys: [],
  dateRange: initialDateRange,
  chartData: null,
  parseProgress: null,
  isBusy: false,
  searchQuery: '',
  showAverage: true,
  statusMessage: null,
  chartOptimization: initialOptimization,
  chartTrendline: initialTrendline,
  setArchiveSummary: (archiveSummary) => set({ archiveSummary }),
  setFiles: (files) => set({ files }),
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
  setFileDetails: (fileDetails) => set({ fileDetails }),
  setTestTypes: (testTypes) => set({ testTypes }),
  setSelectedTestIds: (selectedTestIds) => set({ selectedTestIds }),
  setSelectedObjectKeys: (selectedObjectKeys) => set({ selectedObjectKeys }),
  setDateRange: (dateRange) => set({ dateRange }),
  setChartData: (chartData) => set({ chartData }),
  setParseProgress: (parseProgress) => set({ parseProgress }),
  setBusy: (isBusy) => set({ isBusy }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setShowAverage: (showAverage) => set({ showAverage }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setChartOptimization: (next) =>
    set((state) => ({
      chartOptimization: {
        ...state.chartOptimization,
        ...next
      }
    })),
  setChartTrendline: (next) =>
    set((state) => ({
      chartTrendline: {
        ...state.chartTrendline,
        ...next
      }
    })),
  resetData: () =>
    set({
      archiveSummary: null,
      files: [],
      selectedFileId: null,
      fileDetails: null,
      testTypes: [],
      selectedTestIds: [],
      selectedObjectKeys: [],
      dateRange: initialDateRange,
      chartData: null,
      parseProgress: null,
      isBusy: false,
      searchQuery: '',
      showAverage: true,
      statusMessage: null,
      chartOptimization: initialOptimization,
      chartTrendline: initialTrendline
    })
}));
