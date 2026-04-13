export type UserRole = 'viewer' | 'admin';

export interface AuthToken {
  token: string;
  username: string;
  role: UserRole;
}

export interface ArchiveSummary {
  archiveId: number;
  archivePath: string;
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  okFiles: number;
  warningFiles: number;
  errorFiles: number;
  testNames: string[];
  durationMs: number;
}

export interface ParseProgress {
  current: number;
  total: number;
  filename: string;
}

export interface FileInfo {
  id: number;
  filename: string;
  date: string;
  status: 'ok' | 'warning' | 'error' | string;
  warnings: string[];
  objectCount: number;
  parsedAt: string;
}

export interface TechnologicalObject {
  key: string;
  label: string;
  order: number;
}

export interface FileMeasurementRecord {
  testId: number;
  testName: string;
  objectKey: string;
  objectLabel: string;
  objectOrder: number;
  value: number | null;
  rawValue: string;
}

export interface FileDetails {
  id: number;
  filename: string;
  date: string;
  status: string;
  warnings: string[];
  objectCount: number;
  objects: TechnologicalObject[];
  measurements: FileMeasurementRecord[];
}

export interface TestType {
  id: number;
  canonicalName: string;
  displayName: string;
  unit: string | null;
  aliases: string[];
}

export interface ChartTest {
  testId: number;
  testName: string;
}

export interface ChartObject {
  objectKey: string;
  objectLabel: string;
  objectOrder: number;
}

export interface ChartValuePoint {
  testId: number;
  objectKey: string;
  value: number | null;
}

export interface ChartAveragePoint {
  testId: number;
  value: number | null;
}

export interface ChartPoint {
  date: string;
  values: ChartValuePoint[];
  averages: ChartAveragePoint[];
}

export interface ChartStats {
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  stdDev: number | null;
  pointsWithValues: number;
}

export interface ChartTestStats {
  testId: number;
  testName: string;
  stats: ChartStats;
}

export interface ChartHoverTestStats {
  testId: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  stdDev: number | null;
  cursorValue: number | null;
}

export interface ChartHoverSnapshot {
  date: string;
  statsByTest: ChartHoverTestStats[];
}

export type ChartGuideMode = 'series' | 'average';

export interface ChartDataset {
  tests: ChartTest[];
  objects: ChartObject[];
  points: ChartPoint[];
  statsByTest: ChartTestStats[];
}

export type ExcelCellValue = string | number | null;

export interface ExcelHeaderRow {
  cells: string[];
}

export interface ExcelExportPayload {
  worksheetName: string;
  headerRows: ExcelHeaderRow[];
  rows: ExcelCellValue[][];
}

export type ApproximationMode = 'raw' | 'moving_average' | 'ema';

export interface ChartOptimizationSettings {
  autoOptimize: boolean;
  pointCompression: number;
  lineApproximation: ApproximationMode;
  averageApproximation: ApproximationMode;
  movingAverageWindow: number;
  emaAlpha: number;
  averageMovingAverageWindow: number;
  averageEmaAlpha: number;
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface ChartQuery {
  archiveId: number;
  testIds: number[];
  objectKeys: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface FileChangedEvent {
  filename: string;
  action: string;
}

export interface FileErrorEvent {
  filename: string;
  error: string;
}
