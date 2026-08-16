export type UserRole = 'viewer' | 'admin';

export type AppMode = 'daily' | 'retro';

export interface AuthToken {
  token: string;
  username: string;
  role: UserRole;
}

export interface LicenseStatus {
  required: boolean;
  active: boolean;
  fingerprint: string;
  customerName: string | null;
  licenseId: string | null;
  expiresAt: string | null;
  source: string | null;
  message: string | null;
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

/**
 * Minimal shape the file browser (Sidebar/FileList/FileItem) actually
 * needs — satisfied by both `FileInfo` (daily) and `RetroFileInfo` (retro)
 * so those components render either mode's file list unchanged.
 */
export interface FileListEntry {
  id: number;
  filename: string;
  status: 'ok' | 'warning' | 'error' | string;
  /**
   * Short human label to show instead of `filename` when available (retro
   * mode only — one physical file can hold several sheets/sampling points,
   * and their distinguishing part sits at the end of `filename`, which gets
   * clipped in a narrow list). Falls back to `filename` when absent.
   */
  sourceLabel?: string;
}

export interface TechnologicalObject {
  key: string;
  label: string;
  order: number;
  active: boolean;
}

export interface FileMeasurementRecord {
  testId: number;
  testName: string;
  objectKey: string;
  objectLabel: string;
  objectOrder: number;
  objectActive: boolean;
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

export interface ParameterLink {
  id: string;
  label: string;
  inputTestId: number;
  inputTestName: string;
  outputTestId: number;
  outputTestName: string;
  source: 'auto' | 'manual';
}

export interface ChartTest {
  testId: number;
  testName: string;
}

export interface ChartObject {
  objectKey: string;
  objectLabel: string;
  objectOrder: number;
  objectActive: boolean;
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
  trendCursorValue: number | null;
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

export type TrendlineMode =
  | 'linear'
  | 'power'
  | 'exponential'
  | 'polynomial'
  | 'logarithmic'
  | 'linear_filter'
  | 'moving_average'
  | 'ema';

export type TrendlineSource = 'series' | 'average';

export type TrendlineGroupBy = 'test' | 'object';

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

export interface ChartTrendlineSettings {
  enabled: boolean;
  mode: TrendlineMode;
  groupBy: TrendlineGroupBy;
  polynomialDegree: number;
  linearFilterWindow: number;
  maWindow: number;
  emaAlpha: number;
  showEquation: boolean;
  showRSquared: boolean;
}

export interface ChartTrendlineReport {
  key: string;
  testId: number;
  label: string;
  color: string;
  mode: TrendlineMode;
  source: TrendlineSource;
  equation: string | null;
  rSquared: number | null;
  pointsUsed: number;
  warning: string | null;
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

// --- Retrospective data mode -------------------------------------------------

export interface RetroFileInfo {
  id: number;
  filename: string;
  title: string;
  status: 'ok' | 'warning' | 'error' | string;
  warnings: string[];
  periodFrom: string | null;
  periodTo: string | null;
  parsedAt: string;
  /** Short human label for what this sheet represents, e.g. "Вход ОС" or "Секция 3". */
  sourceLabel: string;
}

export interface RetroFact {
  label: string;
  value: number | null;
  rawValue: string;
}

export interface RetroFileDetails {
  id: number;
  filename: string;
  title: string;
  status: string;
  warnings: string[];
  facts: RetroFact[];
}

/**
 * A named date range used to overlay several time slices of the same
 * parameter on one chart (e.g. "2023" vs "2024" vs "Q1 2023"), each rendered
 * as its own pseudo-object so the existing per-object chart/legend/color
 * machinery renders it without changes.
 */
export interface OverlayPeriod {
  id: string;
  label: string;
  from: string;
  to: string;
  color?: string;
}

// --- Document container (methodologies, report forms, standards) -----------

export interface DocumentCategory {
  id: number;
  name: string;
  orderIndex: number;
}

export interface DocumentInfo {
  id: number;
  categoryId: number | null;
  title: string;
  originalName: string;
  extension: string;
  sizeBytes: number;
  notes: string | null;
  addedAt: string;
  orderIndex: number;
}
