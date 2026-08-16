import { toast } from 'sonner';

import { api, isTauriRuntime, pickExportPath } from '@/lib/tauri-api';
import type { AuthToken, ChartDataset, ChartObject, ChartTest, ExcelCellValue, ExcelExportPayload } from '@/lib/types';

/**
 * Chart-data export helpers, shared by both the daily and retro modes'
 * "Экспорт Excel" actions (see src/app/page.tsx) — the payload shape only
 * depends on the generic `ChartDataset`, not on how the archive was parsed.
 */

/** Builds and saves/downloads the chart-data Excel export. Used by both modes' "Экспорт Excel" button. */
export async function exportChartExcel(
  session: AuthToken | null,
  chartData: ChartDataset | null,
  selectedTestIds: number[],
  selectedObjectKeys: string[]
): Promise<void> {
  if (!chartData) {
    toast.error('Нет данных для экспорта');
    return;
  }

  const payload = buildChartExcelPayload(chartData, selectedTestIds, selectedObjectKeys);

  try {
    if (session && isTauriRuntime()) {
      const fileName = buildExportDefaultName('chart_export', 'xlsx');
      const targetPath = await pickExportPath('Сохранить Excel', fileName, [{ name: 'Excel', extensions: ['xlsx'] }]);
      if (!targetPath) {
        return;
      }

      await api.saveExcelExport(session.token, targetPath, payload);
      toast.success('Excel экспортирован');
      return;
    }

    const fileName = buildExportDefaultName('chart_export', 'xls');
    const blob = new Blob([buildBrowserExcelDocument(payload)], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Excel экспортирован');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось экспортировать Excel';
    toast.error(message);
  }
}

export function buildExportDefaultName(prefix: string, extension: string): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  return `${prefix}_${year}${month}${day}_${hour}${minute}${second}.${extension}`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function buildChartExcelPayload(
  chartData: ChartDataset,
  selectedTestIds: number[],
  selectedObjectKeys: string[]
): ExcelExportPayload {
  const tests =
    selectedTestIds.length === 0
      ? chartData.tests
      : chartData.tests.filter((test) => selectedTestIds.includes(test.testId));
  const objects =
    selectedObjectKeys.length === 0
      ? []
      : chartData.objects.filter((object) => selectedObjectKeys.includes(object.objectKey));

  const headerRows = buildExcelHeaderRows(tests, objects);

  const rows = chartData.points.map((point) => {
    const row: ExcelCellValue[] = [point.date];

    for (const test of tests) {
      for (const object of objects) {
        const value =
          point.values.find((item) => item.testId === test.testId && item.objectKey === object.objectKey)?.value ??
          null;
        row.push(value);
      }
    }

    return row;
  });

  return {
    worksheetName: 'Параметры',
    headerRows,
    rows
  };
}

export function buildExcelHeaderRows(tests: ChartTest[], objects: ChartObject[]): ExcelExportPayload['headerRows'] {
  if (objects.length === 0) {
    return [
      {
        cells: ['Дата', ...tests.map((test) => test.testName)]
      }
    ];
  }

  return [
    {
      cells: ['Дата', ...tests.flatMap((test) => objects.map(() => test.testName))]
    },
    {
      cells: ['', ...tests.flatMap(() => objects.map((object) => object.objectLabel))]
    }
  ];
}

export function buildBrowserExcelDocument(payload: ExcelExportPayload): string {
  const headerRows = payload.headerRows
    .map((row) => `<tr>${row.cells.map((cell) => `<th>${escapeHtml(String(cell))}</th>`).join('')}</tr>`)
    .join('');
  const bodyRows = payload.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(formatExcelCell(cell))}</td>`).join('')}</tr>`)
    .join('');

  return [
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta name="ProgId" content="Excel.Sheet" />',
    '</head>',
    '<body>',
    '<table border="1">',
    `<thead>${headerRows}</thead>`,
    `<tbody>${bodyRows}</tbody>`,
    '</table>',
    '</body>',
    '</html>'
  ].join('');
}

function formatExcelCell(value: ExcelCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
