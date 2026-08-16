import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

import type {
  ArchiveSummary,
  AuthToken,
  ChartDataset,
  ChartQuery,
  DocumentCategory,
  DocumentInfo,
  ExcelExportPayload,
  FileChangedEvent,
  FileDetails,
  FileErrorEvent,
  FileInfo,
  LicenseStatus,
  ParseProgress,
  RetroFileDetails,
  RetroFileInfo,
  TestType
} from '@/lib/types';

const isTauri = () =>
  typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, '__TAURI_INTERNALS__');

export const isTauriRuntime = () => isTauri();

function assertTauri() {
  if (!isTauri()) {
    throw new Error('Команда доступна только внутри Tauri окружения');
  }
}

export async function pickArchiveFolder(): Promise<string | null> {
  assertTauri();
  const selection = await open({
    directory: true,
    multiple: false,
    title: 'Выберите директорию архива'
  });

  if (!selection) {
    return null;
  }

  return Array.isArray(selection) ? selection[0] : selection;
}

export async function pickExportPath(
  title: string,
  defaultPath: string,
  filters: Array<{ name: string; extensions: string[] }>
): Promise<string | null> {
  assertTauri();

  const selection = await save({
    title,
    defaultPath,
    filters
  });

  if (!selection) {
    return null;
  }

  return Array.isArray(selection) ? selection[0] : selection;
}

export const api = {
  async getLicenseStatus(): Promise<LicenseStatus> {
    assertTauri();
    return invoke<LicenseStatus>('get_license_status');
  },

  async activateLicenseOnline(licenseKey: string): Promise<LicenseStatus> {
    assertTauri();
    return invoke<LicenseStatus>('activate_license_online', { licenseKey });
  },

  async activateLicenseOffline(token: string): Promise<LicenseStatus> {
    assertTauri();
    return invoke<LicenseStatus>('activate_license_offline', { token });
  },

  async clearLicense(): Promise<LicenseStatus> {
    assertTauri();
    return invoke<LicenseStatus>('clear_license');
  },

  async login(username: string, password: string): Promise<AuthToken> {
    assertTauri();
    return invoke<AuthToken>('login', { username, password });
  },

  async logout(sessionToken: string): Promise<boolean> {
    assertTauri();
    return invoke<boolean>('logout', { sessionToken });
  },

  async whoami(sessionToken: string): Promise<AuthToken> {
    assertTauri();
    return invoke<AuthToken>('whoami', { sessionToken });
  },

  async selectArchive(sessionToken: string, archivePath: string): Promise<ArchiveSummary> {
    assertTauri();
    return invoke<ArchiveSummary>('select_archive', { sessionToken, archivePath });
  },

  async rescanArchive(sessionToken: string, archiveId: number): Promise<ArchiveSummary> {
    assertTauri();
    return invoke<ArchiveSummary>('rescan_archive', { sessionToken, archiveId });
  },

  async getFileList(sessionToken: string, archiveId?: number): Promise<FileInfo[]> {
    assertTauri();
    return invoke<FileInfo[]>('get_file_list', { sessionToken, archiveId });
  },

  async getFileDetails(sessionToken: string, fileId: number): Promise<FileDetails> {
    assertTauri();
    return invoke<FileDetails>('get_file_details', { sessionToken, fileId });
  },

  async getTestTypes(sessionToken: string, archiveId?: number): Promise<TestType[]> {
    assertTauri();
    return invoke<TestType[]>('get_test_types', { sessionToken, archiveId });
  },

  async getChartData(sessionToken: string, params: ChartQuery): Promise<ChartDataset> {
    assertTauri();
    return invoke<ChartDataset>('get_chart_data', {
      query: {
        sessionToken,
        archiveId: params.archiveId,
        testIds: params.testIds,
        objectKeys: params.objectKeys,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo
      }
    });
  },

  async getLastArchivePath(sessionToken: string): Promise<string | null> {
    assertTauri();
    return invoke<string | null>('get_last_archive_path', { sessionToken });
  },

  async getSetting(sessionToken: string, key: string): Promise<string | null> {
    assertTauri();
    return invoke<string | null>('get_setting', { sessionToken, key });
  },

  async setSetting(sessionToken: string, key: string, value: string): Promise<void> {
    assertTauri();
    await invoke('set_setting', { sessionToken, key, value });
  },

  async saveExportFile(sessionToken: string, targetPath: string, bytes: number[]): Promise<void> {
    assertTauri();
    await invoke('save_export_file', { sessionToken, targetPath, bytes });
  },

  async saveExcelExport(
    sessionToken: string,
    targetPath: string,
    payload: ExcelExportPayload
  ): Promise<void> {
    assertTauri();
    await invoke('save_excel_export', { sessionToken, targetPath, payload });
  },

  async onParseProgress(handler: (payload: ParseProgress) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<ParseProgress>('parse:progress', (event) => handler(event.payload));
  },

  async onParseComplete(handler: (payload: ArchiveSummary) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<ArchiveSummary>('parse:complete', (event) => handler(event.payload));
  },

  async onFileChanged(handler: (payload: FileChangedEvent) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<FileChangedEvent>('file:changed', (event) => handler(event.payload));
  },

  async onFileError(handler: (payload: FileErrorEvent) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<FileErrorEvent>('file:error', (event) => handler(event.payload));
  },

  // --- Retrospective ("retro") mode -----------------------------------------------

  async selectRetroArchive(sessionToken: string, archivePath: string): Promise<ArchiveSummary> {
    assertTauri();
    return invoke<ArchiveSummary>('select_retro_archive', { sessionToken, archivePath });
  },

  async rescanRetroArchive(sessionToken: string, archiveId: number): Promise<ArchiveSummary> {
    assertTauri();
    return invoke<ArchiveSummary>('rescan_retro_archive', { sessionToken, archiveId });
  },

  async getRetroFileList(sessionToken: string, archiveId?: number): Promise<RetroFileInfo[]> {
    assertTauri();
    return invoke<RetroFileInfo[]>('get_retro_file_list', { sessionToken, archiveId });
  },

  async getRetroFileDetails(sessionToken: string, fileId: number): Promise<RetroFileDetails> {
    assertTauri();
    return invoke<RetroFileDetails>('get_retro_file_details', { sessionToken, fileId });
  },

  /**
   * With `fileId` — only the parameters of that sheet, which is what the
   * retro sidebar lists. Without it — every parameter of the archive, used
   * to keep showing parameters that stay selected from another sheet.
   */
  async getRetroTestTypes(
    sessionToken: string,
    archiveId?: number,
    fileId?: number
  ): Promise<TestType[]> {
    assertTauri();
    return invoke<TestType[]>('get_retro_test_types', { sessionToken, archiveId, fileId });
  },

  async getRetroChartData(sessionToken: string, params: ChartQuery): Promise<ChartDataset> {
    assertTauri();
    return invoke<ChartDataset>('get_retro_chart_data', {
      query: {
        sessionToken,
        archiveId: params.archiveId,
        testIds: params.testIds,
        objectKeys: params.objectKeys,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo
      }
    });
  },

  async getLastRetroArchivePath(sessionToken: string): Promise<string | null> {
    assertTauri();
    return invoke<string | null>('get_last_retro_archive_path', { sessionToken });
  },

  async onRetroParseProgress(handler: (payload: ParseProgress) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<ParseProgress>('retro:progress', (event) => handler(event.payload));
  },

  async onRetroParseComplete(handler: (payload: ArchiveSummary) => void): Promise<UnlistenFn> {
    assertTauri();
    return listen<ArchiveSummary>('retro:complete', (event) => handler(event.payload));
  },

  // --- Document container -----------------------------------------------------------

  async listDocumentCategories(sessionToken: string): Promise<DocumentCategory[]> {
    assertTauri();
    return invoke<DocumentCategory[]>('list_document_categories', { sessionToken });
  },

  async createDocumentCategory(sessionToken: string, name: string): Promise<DocumentCategory> {
    assertTauri();
    return invoke<DocumentCategory>('create_document_category', { sessionToken, name });
  },

  async renameDocumentCategory(sessionToken: string, categoryId: number, name: string): Promise<DocumentCategory> {
    assertTauri();
    return invoke<DocumentCategory>('rename_document_category', { sessionToken, categoryId, name });
  },

  async deleteDocumentCategory(sessionToken: string, categoryId: number): Promise<void> {
    assertTauri();
    await invoke('delete_document_category', { sessionToken, categoryId });
  },

  async listDocuments(sessionToken: string, categoryId: number | null): Promise<DocumentInfo[]> {
    assertTauri();
    return invoke<DocumentInfo[]>('list_documents', { sessionToken, categoryId });
  },

  async listAllDocuments(sessionToken: string): Promise<DocumentInfo[]> {
    assertTauri();
    return invoke<DocumentInfo[]>('list_all_documents', { sessionToken });
  },

  async importDocument(
    sessionToken: string,
    sourcePath: string,
    categoryId: number | null,
    title: string | null
  ): Promise<DocumentInfo> {
    assertTauri();
    return invoke<DocumentInfo>('import_document', { sessionToken, sourcePath, categoryId, title });
  },

  async updateDocument(
    sessionToken: string,
    documentId: number,
    title: string,
    categoryId: number | null,
    notes: string | null
  ): Promise<DocumentInfo> {
    assertTauri();
    return invoke<DocumentInfo>('update_document', { sessionToken, documentId, title, categoryId, notes });
  },

  async deleteDocument(sessionToken: string, documentId: number): Promise<void> {
    assertTauri();
    await invoke('delete_document', { sessionToken, documentId });
  },

  async readDocumentBytes(sessionToken: string, documentId: number): Promise<number[]> {
    assertTauri();
    return invoke<number[]>('read_document_bytes', { sessionToken, documentId });
  },

  async revealDocument(sessionToken: string, documentId: number): Promise<void> {
    assertTauri();
    await invoke('reveal_document', { sessionToken, documentId });
  },

  async pickDocumentFile(): Promise<string | null> {
    assertTauri();
    const selection = await open({
      directory: false,
      multiple: false,
      title: 'Выберите документ'
    });
    if (!selection) {
      return null;
    }
    return Array.isArray(selection) ? selection[0] : selection;
  }
};
