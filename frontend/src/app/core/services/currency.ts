import { signal } from '@angular/core';

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
  symbolFirst: boolean;
}

export const DEFAULT_CURRENCY: CurrencyOption = {
  code: 'PKR',
  symbol: 'Rs',
  name: 'Pakistani rupee',
  decimals: 2,
  symbolFirst: true,
};

/**
 * The currency the whole app formats money with. It is one module level signal rather
 * than an injected value because plain functions need it too: AG Grid value formatters
 * and Chart.js tick callbacks are not Angular components and cannot inject anything.
 */
const active = signal<CurrencyOption>(DEFAULT_CURRENCY);

export const activeCurrency = active.asReadonly();

const availableOptions = signal<CurrencyOption[]>([DEFAULT_CURRENCY]);

export const availableCurrencies = availableOptions.asReadonly();

export function setActiveCurrency(option: CurrencyOption): void {
  active.set(option);
}

export function setAvailableCurrencies(options: CurrencyOption[]): void {
  availableOptions.set(options.length > 0 ? options : [DEFAULT_CURRENCY]);
}

export function currencySymbol(): string {
  return active().symbol;
}

export function currencyCode(): string {
  return active().code;
}

/** Money with the currency symbol, for totals, cards and statements. */
export function formatMoney(value: unknown): string {
  const option = active();
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return '';
  }

  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: option.decimals,
    maximumFractionDigits: option.decimals,
  });

  return option.symbolFirst ? `${option.symbol} ${text}` : `${text} ${option.symbol}`;
}

/**
 * Money without the symbol. Used where a column or a row already says which currency it
 * is, so repeating the symbol on every line would only add noise.
 */
export function formatAmount(value: unknown): string {
  const option = active();
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return '';
  }

  return amount.toLocaleString('en-US', {
    minimumFractionDigits: option.decimals,
    maximumFractionDigits: option.decimals,
  });
}

/** Short form for chart axes, where a six figure total would crowd the plot. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }

  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
