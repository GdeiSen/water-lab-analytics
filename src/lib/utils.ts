import { format, parseISO } from 'date-fns';

export const STATUS_COLORS: Record<string, string> = {
  ok: '#E8F5E9',
  warning: '#FFF8E1',
  error: '#FFEBEE'
};

export const STATUS_LABELS: Record<string, string> = {
  ok: 'OK',
  warning: 'Warning',
  error: 'Error'
};

export const TANK_COLORS = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#7B2CBF',
  '#CC79A7',
  '#1D4ED8',
  '#B45309',
  '#0F766E',
  '#BE123C',
  '#374151'
];

export function formatDate(date: string): string {
  try {
    return format(parseISO(date), 'dd.MM.yyyy');
  } catch {
    return date;
  }
}

export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

export function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return format(value, 'yyyy-MM-dd');
}

export function fromIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return parseISO(value);
  } catch {
    return undefined;
  }
}

export function statusToTone(status: string): string {
  if (status === 'ok') {
    return 'text-leaf';
  }
  if (status === 'warning') {
    return 'text-warning';
  }
  if (status === 'error') {
    return 'text-ember';
  }
  return 'text-ink/70';
}
