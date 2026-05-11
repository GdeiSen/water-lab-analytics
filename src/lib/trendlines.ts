import { differenceInCalendarDays, parseISO } from 'date-fns';

import type {
  ChartTrendlineReport,
  ChartTrendlineSettings,
  TrendlineSource,
  TrendlineMode
} from '@/lib/types';

interface TrendlineSample {
  x: number;
  y: number;
}

interface TrendlineComputeInput {
  key: string;
  testId: number;
  label: string;
  color: string;
  source: TrendlineSource;
  fitDates: string[];
  fitValues: Array<number | null>;
  renderDates: string[];
  renderValues: Array<number | null>;
  settings: ChartTrendlineSettings;
}

export interface TrendlineComputation extends ChartTrendlineReport {
  dataKey: string;
  values: Array<number | null>;
}

export function computeTrendline(input: TrendlineComputeInput): TrendlineComputation {
  const dataKey = `trendline_${input.key}`;

  if (input.settings.mode === 'linear_filter') {
    return computeLinearFilterTrendline({
      ...input,
      dataKey
    });
  }

  if (input.settings.mode === 'moving_average') {
    return computeMovingAverageTrendline({
      ...input,
      dataKey
    });
  }

  if (input.settings.mode === 'ema') {
    return computeEmaTrendline({
      ...input,
      dataKey
    });
  }

  const fitAxis = buildTimeAxis(input.fitDates);
  const renderAxis = buildTimeAxis(input.renderDates);
  const rawSamples = collectSamples(fitAxis, input.fitValues);

  if (rawSamples.length < 2) {
    return buildInvalidResult(input, dataKey, 'Недостаточно точек для построения тренда');
  }

  const fitted = fitRegression(rawSamples, input.settings);
  if (!fitted) {
    return buildInvalidResult(input, dataKey, 'Не удалось вычислить параметры функции');
  }
  if (fitted.samples.length < fitted.minimumSamples) {
    return buildInvalidResult(input, dataKey, fitted.sampleRequirementMessage);
  }
  if (fitted.warning) {
    return buildInvalidResult(input, dataKey, fitted.warning);
  }

  const values = renderAxis.map((x) => evaluateTrendline(fitted.mode, fitted.coefficients, x));
  const rSquared = calculateRSquared(fitted.samples, (x) =>
    evaluateTrendline(fitted.mode, fitted.coefficients, x)
  );

  return {
    key: input.key,
    dataKey,
    testId: input.testId,
    label: input.label,
    color: input.color,
    mode: input.settings.mode,
    source: input.source,
    equation: buildEquationText(fitted.mode, fitted.coefficients),
    rSquared,
    pointsUsed: fitted.samples.length,
    warning: null,
    values
  };
}

interface FittedTrendline {
  mode: Exclude<TrendlineMode, 'linear_filter' | 'moving_average' | 'ema'>;
  coefficients: number[];
  samples: TrendlineSample[];
  minimumSamples: number;
  sampleRequirementMessage: string;
  warning: string | null;
}

function fitRegression(
  samples: TrendlineSample[],
  settings: ChartTrendlineSettings
): FittedTrendline | null {
  switch (settings.mode) {
    case 'linear':
      return fitLinear(samples);
    case 'power':
      return fitPower(samples);
    case 'exponential':
      return fitExponential(samples);
    case 'polynomial':
      return fitPolynomial(samples, settings.polynomialDegree);
    case 'logarithmic':
      return fitLogarithmic(samples);
    case 'linear_filter':
    case 'moving_average':
    case 'ema':
      return null;
  }
}

function fitLinear(samples: TrendlineSample[]): FittedTrendline | null {
  const regression = linearRegression(samples.map((sample) => [sample.x, sample.y] as const));
  if (!regression) {
    return null;
  }

  return {
    mode: 'linear',
    coefficients: [regression.intercept, regression.slope],
    samples,
    minimumSamples: 2,
    sampleRequirementMessage: 'Для линейного тренда нужны минимум 2 точки',
    warning: null
  };
}

function fitPower(samples: TrendlineSample[]): FittedTrendline | null {
  const filtered = samples.filter((sample) => sample.x > 0 && sample.y > 0);
  if (filtered.length < 2) {
    return {
      mode: 'power',
      coefficients: [],
      samples: filtered,
      minimumSamples: 2,
      sampleRequirementMessage: 'Для степенного тренда нужны минимум 2 положительные точки',
      warning: filtered.length === 0 ? 'Степенной тренд требует положительные x и y' : null
    };
  }

  const regression = linearRegression(
    filtered.map((sample) => [Math.log(sample.x), Math.log(sample.y)] as const)
  );
  if (!regression) {
    return null;
  }

  return {
    mode: 'power',
    coefficients: [Math.exp(regression.intercept), regression.slope],
    samples: filtered,
    minimumSamples: 2,
    sampleRequirementMessage: 'Для степенного тренда нужны минимум 2 положительные точки',
    warning: null
  };
}

function fitExponential(samples: TrendlineSample[]): FittedTrendline | null {
  const filtered = samples.filter((sample) => sample.y > 0);
  if (filtered.length < 2) {
    return {
      mode: 'exponential',
      coefficients: [],
      samples: filtered,
      minimumSamples: 2,
      sampleRequirementMessage: 'Для экспоненциального тренда нужны минимум 2 положительные точки',
      warning: filtered.length === 0 ? 'Экспоненциальный тренд требует положительные значения y' : null
    };
  }

  const regression = linearRegression(
    filtered.map((sample) => [sample.x, Math.log(sample.y)] as const)
  );
  if (!regression) {
    return null;
  }

  return {
    mode: 'exponential',
    coefficients: [Math.exp(regression.intercept), regression.slope],
    samples: filtered,
    minimumSamples: 2,
    sampleRequirementMessage: 'Для экспоненциального тренда нужны минимум 2 положительные точки',
    warning: null
  };
}

function fitLogarithmic(samples: TrendlineSample[]): FittedTrendline | null {
  const filtered = samples.filter((sample) => sample.x > 0);
  if (filtered.length < 2) {
    return {
      mode: 'logarithmic',
      coefficients: [],
      samples: filtered,
      minimumSamples: 2,
      sampleRequirementMessage: 'Для логарифмического тренда нужны минимум 2 точки с x > 0',
      warning: filtered.length === 0 ? 'Логарифмический тренд требует положительные x' : null
    };
  }

  const regression = linearRegression(
    filtered.map((sample) => [Math.log(sample.x), sample.y] as const)
  );
  if (!regression) {
    return null;
  }

  return {
    mode: 'logarithmic',
    coefficients: [regression.intercept, regression.slope],
    samples: filtered,
    minimumSamples: 2,
    sampleRequirementMessage: 'Для логарифмического тренда нужны минимум 2 точки с x > 0',
    warning: null
  };
}

function fitPolynomial(samples: TrendlineSample[], degree: number): FittedTrendline | null {
  const safeDegree = Math.min(4, Math.max(2, Math.trunc(degree)));
  const minimumSamples = safeDegree + 1;

  if (samples.length < minimumSamples) {
    return {
      mode: 'polynomial',
      coefficients: [],
      samples,
      minimumSamples,
      sampleRequirementMessage: `Для полинома ${safeDegree}-й степени нужны минимум ${minimumSamples} точки`,
      warning: null
    };
  }

  const matrixSize = safeDegree + 1;
  const matrix: number[][] = Array.from({ length: matrixSize }, () =>
    Array.from({ length: matrixSize }, () => 0)
  );
  const vector: number[] = Array.from({ length: matrixSize }, () => 0);

  for (let row = 0; row < matrixSize; row += 1) {
    for (let col = 0; col < matrixSize; col += 1) {
      matrix[row][col] = samples.reduce((sum, sample) => sum + sample.x ** (row + col), 0);
    }
    vector[row] = samples.reduce((sum, sample) => sum + sample.y * sample.x ** row, 0);
  }

  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients) {
    return null;
  }

  return {
    mode: 'polynomial',
    coefficients,
    samples,
    minimumSamples,
    sampleRequirementMessage: `Для полинома ${safeDegree}-й степени нужны минимум ${minimumSamples} точки`,
    warning: null
  };
}

function computeLinearFilterTrendline(
  input: TrendlineComputeInput & { dataKey: string }
): TrendlineComputation {
  const window = normalizeFilterWindow(input.settings.linearFilterWindow);
  const values = movingWeightedAverage(input.renderValues, window);
  const pointsUsed = values.filter((value): value is number => typeof value === 'number').length;

  return {
    key: input.key,
    dataKey: input.dataKey,
    testId: input.testId,
    label: input.label,
    color: input.color,
    mode: 'linear_filter',
    source: input.source,
    equation: `Линейный фильтр, окно ${window}`,
    rSquared: null,
    pointsUsed,
    warning: pointsUsed >= 2 ? null : 'Недостаточно точек для линейной фильтрации',
    values
  };
}

function computeMovingAverageTrendline(
  input: TrendlineComputeInput & { dataKey: string }
): TrendlineComputation {
  const window = Math.max(2, Math.trunc(input.settings.maWindow));
  const values = simpleMovingAverage(input.renderValues, window);
  const pointsUsed = values.filter((value): value is number => typeof value === 'number').length;

  return {
    key: input.key,
    dataKey: input.dataKey,
    testId: input.testId,
    label: input.label,
    color: input.color,
    mode: 'moving_average',
    source: input.source,
    equation: `Скользящая средняя, окно ${window}`,
    rSquared: null,
    pointsUsed,
    warning: pointsUsed >= 2 ? null : 'Недостаточно точек для скользящей средней',
    values
  };
}

function computeEmaTrendline(
  input: TrendlineComputeInput & { dataKey: string }
): TrendlineComputation {
  const alpha = Math.min(0.95, Math.max(0.05, input.settings.emaAlpha));
  const values = exponentialMovingAverage(input.renderValues, alpha);
  const pointsUsed = values.filter((value): value is number => typeof value === 'number').length;

  return {
    key: input.key,
    dataKey: input.dataKey,
    testId: input.testId,
    label: input.label,
    color: input.color,
    mode: 'ema',
    source: input.source,
    equation: `EMA, α=${Number(alpha.toFixed(3))}`,
    rSquared: null,
    pointsUsed,
    warning: pointsUsed >= 2 ? null : 'Недостаточно точек для EMA',
    values
  };
}

function buildInvalidResult(
  input: TrendlineComputeInput,
  dataKey: string,
  warning: string
): TrendlineComputation {
  return {
    key: input.key,
    dataKey,
    testId: input.testId,
    label: input.label,
    color: input.color,
    mode: input.settings.mode,
    source: input.source,
    equation: null,
    rSquared: null,
    pointsUsed: 0,
    warning,
    values: input.renderDates.map(() => null)
  };
}

function collectSamples(axis: number[], values: Array<number | null>): TrendlineSample[] {
  return values.flatMap((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [];
    }
    return [{ x: axis[index] ?? index + 1, y: value }];
  });
}

function buildTimeAxis(dates: string[]): number[] {
  if (dates.length === 0) {
    return [];
  }

  const parsed = dates.map((value) => {
    try {
      return parseISO(value);
    } catch {
      return null;
    }
  });
  const firstValid = parsed.find(
    (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime())
  );

  if (!firstValid) {
    return dates.map((_, index) => index + 1);
  }

  return parsed.map((value, index) => {
    if (!value || Number.isNaN(value.getTime())) {
      return index + 1;
    }
    return differenceInCalendarDays(value, firstValid) + 1;
  });
}

function evaluateTrendline(
  mode: Exclude<TrendlineMode, 'linear_filter' | 'moving_average' | 'ema'>,
  coefficients: number[],
  x: number
): number | null {
  switch (mode) {
    case 'linear':
      return coefficients[0] + coefficients[1] * x;
    case 'power':
      return x > 0 ? coefficients[0] * x ** coefficients[1] : null;
    case 'exponential':
      return coefficients[0] * Math.exp(coefficients[1] * x);
    case 'polynomial':
      return coefficients.reduce((sum, coefficient, index) => sum + coefficient * x ** index, 0);
    case 'logarithmic':
      return x > 0 ? coefficients[0] + coefficients[1] * Math.log(x) : null;
  }
}

function buildEquationText(
  mode: Exclude<TrendlineMode, 'linear_filter' | 'moving_average' | 'ema'>,
  coefficients: number[]
): string {
  switch (mode) {
    case 'linear':
      return `y = ${formatSignedNumber(coefficients[0])} ${formatSlope(coefficients[1], 'x')}`;
    case 'power':
      return `y = ${formatNumber(coefficients[0])} · x^${formatNumber(coefficients[1])}`;
    case 'exponential':
      return `y = ${formatNumber(coefficients[0])} · e^(${formatNumber(coefficients[1])}x)`;
    case 'logarithmic':
      return `y = ${formatSignedNumber(coefficients[0])} ${formatSlope(coefficients[1], 'ln(x)')}`;
    case 'polynomial':
      return buildPolynomialEquation(coefficients);
  }
}

function buildPolynomialEquation(coefficients: number[]): string {
  const parts: string[] = [];

  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    const coefficient = coefficients[index];
    if (Math.abs(coefficient) < 1e-12) {
      continue;
    }

    const absValue = Math.abs(coefficient);
    let term = '';
    if (index === 0) {
      term = formatNumber(absValue);
    } else if (index === 1) {
      term = `${formatNumber(absValue)}x`;
    } else {
      term = `${formatNumber(absValue)}x^${index}`;
    }

    parts.push(`${coefficient < 0 ? '-' : '+'} ${term}`);
  }

  if (parts.length === 0) {
    return 'y = 0';
  }

  const [first, ...rest] = parts;
  const normalizedFirst = first.startsWith('+ ') ? first.slice(2) : first;
  return `y = ${[normalizedFirst, ...rest].join(' ')}`;
}

function formatSlope(value: number, variable: string): string {
  const sign = value < 0 ? '-' : '+';
  return `${sign} ${formatNumber(Math.abs(value))}${variable ? ` · ${variable}` : ''}`;
}

function formatSignedNumber(value: number): string {
  return value < 0 ? `-${formatNumber(Math.abs(value))}` : formatNumber(value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const absolute = Math.abs(value);
  if ((absolute >= 10000 || (absolute > 0 && absolute < 0.001))) {
    return value.toExponential(3).replace('e+', 'e');
  }
  const digits = absolute >= 100 ? 2 : absolute >= 10 ? 3 : 4;
  return Number(value.toFixed(digits)).toString();
}

function calculateRSquared(samples: TrendlineSample[], predict: (x: number) => number | null): number | null {
  if (samples.length < 2) {
    return null;
  }

  const mean = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
  let ssRes = 0;
  let ssTot = 0;

  for (const sample of samples) {
    const predicted = predict(sample.x);
    if (predicted === null || !Number.isFinite(predicted)) {
      return null;
    }

    ssRes += (sample.y - predicted) ** 2;
    ssTot += (sample.y - mean) ** 2;
  }

  if (ssTot <= Number.EPSILON) {
    return ssRes <= Number.EPSILON ? 1 : 0;
  }

  return 1 - ssRes / ssTot;
}

function movingWeightedAverage(values: Array<number | null>, window: number): Array<number | null> {
  const radius = Math.floor(window / 2);

  return values.map((_, index) => {
    let weightedSum = 0;
    let weightTotal = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }

      const weight = radius + 1 - Math.abs(offset);
      weightedSum += value * weight;
      weightTotal += weight;
    }

    return weightTotal > 0 ? weightedSum / weightTotal : null;
  });
}

function normalizeFilterWindow(value: number): number {
  const safe = Math.max(3, Math.min(31, Math.trunc(value)));
  return safe % 2 === 0 ? safe + 1 : safe;
}

function linearRegression(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length < 2) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;

  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const count = points.length;
  const denominator = count * sumXX - sumX * sumX;
  if (Math.abs(denominator) <= Number.EPSILON) {
    return null;
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return { intercept, slope };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) <= Number.EPSILON) {
      return null;
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const pivotValue = augmented[pivot][pivot];
    for (let col = pivot; col <= size; col += 1) {
      augmented[pivot][col] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function simpleMovingAverage(values: Array<number | null>, window: number): Array<number | null> {
  const result: Array<number | null> = [];
  for (let index = 0; index < values.length; index += 1) {
    const from = Math.max(0, index - window + 1);
    const slice = values
      .slice(from, index + 1)
      .filter((value): value is number => value !== null);
    if (slice.length === 0) {
      result.push(null);
      continue;
    }
    result.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  }
  return result;
}

function exponentialMovingAverage(values: Array<number | null>, alpha: number): Array<number | null> {
  const result: Array<number | null> = [];
  let previous: number | null = null;

  for (const value of values) {
    if (value === null) {
      result.push(previous);
      continue;
    }

    if (previous === null) {
      previous = value;
    } else {
      previous = alpha * value + (1 - alpha) * previous;
    }

    result.push(previous);
  }

  return result;
}
