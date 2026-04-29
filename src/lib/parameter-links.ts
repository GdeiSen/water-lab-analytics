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
