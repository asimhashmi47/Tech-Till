import { formatMoney } from '../../core/services/currency';

/** Shared date range helpers for the report screens. */

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function today(): string {
  return isoDate(new Date());
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

export function startOfMonth(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function monthsAgo(months: number): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth() - months, 1));
}

export function money(value: number): string {
  return formatMoney(value);
}

export function longDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface RangePreset {
  label: string;
  from: () => string;
  to: () => string;
}

export const RANGE_PRESETS: RangePreset[] = [
  { label: 'This month', from: startOfMonth, to: today },
  { label: 'Last 30 days', from: () => daysAgo(30), to: today },
  { label: 'Last 3 months', from: () => monthsAgo(2), to: today },
  { label: 'Last 12 months', from: () => monthsAgo(11), to: today },
];
