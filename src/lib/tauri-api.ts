import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

import type {
  ArchiveSummary,
  AuthToken,
  ChartDataset,
  ChartQuery,
  ExcelExportPayload,
  FileChangedEvent,
  FileDetails,
  FileErrorEvent,
  FileInfo,
  LicenseStatus,
  ParseProgress,
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

  async getTestTypes(sessionToken: string): Promise<TestType[]> {
    assertTauri();
    return invoke<TestType[]>('get_test_types', { sessionToken });
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
  }
};
