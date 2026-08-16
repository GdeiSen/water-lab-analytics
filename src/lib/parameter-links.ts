import type { ParameterLink, TestType } from '@/lib/types';

interface Candidate {
  test: TestType;
  base: string;
}

export function buildParameterLinks(testTypes: TestType[]): ParameterLink[] {
  const inputs = new Map<string, Candidate>();
  const outputs = new Map<string, Candidate>();

  for (const test of testTypes) {
    const parsed = parseDirectionalName(test.displayName);
    if (!parsed) {
      continue;
    }

    const target = parsed.direction === 'input' ? inputs : outputs;
    if (!target.has(parsed.base)) {
      target.set(parsed.base, { test, base: parsed.base });
    }
  }

  return Array.from(inputs.values())
    .filter((input) => outputs.has(input.base))
    .map((input) => {
      const output = outputs.get(input.base)!;
      return {
        id: `${input.test.id}-${output.test.id}`,
        label: input.base,
        inputTestId: input.test.id,
        inputTestName: input.test.displayName,
        outputTestId: output.test.id,
        outputTestName: output.test.displayName,
        source: 'auto'
      };
    });
}

function parseDirectionalName(name: string): { direction: 'input' | 'output'; base: string } | null {
  const normalized = normalizeName(name);
  const direction = normalized.includes(' на входе ')
    ? 'input'
    : normalized.includes(' на выходе ')
      ? 'output'
      : null;

  if (!direction) {
    return null;
  }

  const base = normalized
    .replace(' на входе ', ' ')
    .replace(' на выходе ', ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return base ? { direction, base } : null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Both the daily archive (per-object "секция" columns can duplicate an
 * aggregate "аэротенк" row for the same underlying parameter) and retro
 * files can end up offering two test types that are really the same
 * measurement at different scopes. Keeps the more specific (section-scoped)
 * entry and drops the aggregate duplicate.
 */
export function filterDuplicateScopedTestTypes(testTypes: TestType[]): TestType[] {
  const aerotankBases = new Set(
    testTypes.filter((test) => isAerotankScopedTest(test.displayName)).map((test) => scopeAgnosticTestName(test.displayName))
  );

  return testTypes.filter((test) => {
    if (!isSectionScopedTest(test.displayName)) {
      return true;
    }
    return !aerotankBases.has(scopeAgnosticTestName(test.displayName));
  });
}

function isAerotankScopedTest(value: string): boolean {
  const normalized = value.toLocaleLowerCase('ru-RU');
  return normalized.includes('аэротенк') && !normalized.includes('секции');
}

function isSectionScopedTest(value: string): boolean {
  const normalized = value.toLocaleLowerCase('ru-RU');
  return normalized.includes('секции') && !normalized.includes('аэротенк');
}

function scopeAgnosticTestName(value: string): string {
  return value
    .toLocaleLowerCase('ru-RU')
    .replaceAll('аэротенка', 'объекта')
    .replaceAll('аэротенку', 'объекта')
    .replaceAll('аэротенк', 'объекта')
    .replaceAll('секции', 'объекта')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildManualParameterLinkLabel(inputName: string, outputName: string): string {
  const input = normalizeParameterLinkName(inputName);
  const output = normalizeParameterLinkName(outputName);
  if (input && output && input === output) {
    return input;
  }
  return `${inputName} -> ${outputName}`;
}

export function isSameParameterPair(
  leftInputId: number,
  leftOutputId: number,
  rightInputId: number,
  rightOutputId: number
): boolean {
  return (
    (leftInputId === rightInputId && leftOutputId === rightOutputId) ||
    (leftInputId === rightOutputId && leftOutputId === rightInputId)
  );
}

function normalizeParameterLinkName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+на\s+входе\s+/g, ' ')
    .replace(/\s+на\s+выходе\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
