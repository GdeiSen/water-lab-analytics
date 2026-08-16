import type { ChartDataset, ExcelExportPayload, OverlayPeriod } from '@/lib/types';

/**
 * Builds a retro-style export (parameters as rows, months 1..12 as
 * columns, one block per period) from a daily-mode `ChartDataset` — the
 * same layout as the customer's own retrospective files (see the project
 * plan). Reuses the existing `ExcelExportPayload` shape / `saveExcelExport`
 * command as-is; only the row/column arrangement differs from the
 * date-indexed `buildChartExcelPayload`.
 */
export function buildRetroExportWorkbook(
  dataset: ChartDataset,
  periods: OverlayPeriod[],
  selectedTestIds: number[],
  selectedObjectKeys: string[]
): ExcelExportPayload {
  const tests =
    selectedTestIds.length === 0 ? dataset.tests : dataset.tests.filter((test) => selectedTestIds.includes(test.testId));
  const objects =
    selectedObjectKeys.length === 0
      ? dataset.objects
      : dataset.objects.filter((object) => selectedObjectKeys.includes(object.objectKey));

  const headerRows: ExcelExportPayload['headerRows'] = [
    {
      cells: [
        'Наименование показателей',
        ...Array.from({ length: 12 }, (_, index) => String(index + 1)),
        'Средний по месяцам'
      ]
    }
  ];

  const rows: ExcelExportPayload['rows'] = [];

  for (const period of periods) {
    rows.push([period.label]);

    for (const test of tests) {
      for (const object of objects) {
        const monthlyAverages = computeMonthlyAverages(dataset, period, test.testId, object.objectKey);
        const definedValues = monthlyAverages.filter((value): value is number => value !== null);
        const periodAverage =
          definedValues.length > 0 ? definedValues.reduce((sum, value) => sum + value, 0) / definedValues.length : null;
        const label = objects.length > 1 ? `${test.testName} (${object.objectLabel})` : test.testName;
        rows.push([label, ...monthlyAverages, periodAverage]);
      }
    }
  }

  return {
    worksheetName: 'Ретро-данные',
    headerRows,
    rows
  };
}

function computeMonthlyAverages(
  dataset: ChartDataset,
  period: OverlayPeriod,
  testId: number,
  objectKey: string
): Array<number | null> {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);

  for (const point of dataset.points) {
    if (point.date < period.from || point.date > period.to) {
      continue;
    }
    const month = Number(point.date.slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      continue;
    }

    const value = point.values.find((item) => item.testId === testId && item.objectKey === objectKey)?.value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      buckets[month - 1].push(value);
    }
  }

  return buckets.map((values) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null));
}
