import { ChartOptions } from 'chart.js';

import { formatAmount, formatCompact, formatMoney } from '../../core/services/currency';

/**
 * Chart.js cannot read CSS custom properties, so the accent values are repeated here as
 * literals. They are the same colours as the tokens; change them together.
 */
export const CHART_COLORS = {
  indigo: '#4f46e5',
  indigoSoft: 'rgba(79, 70, 229, 0.16)',
  violet: '#7c3aed',
  violetSoft: 'rgba(124, 58, 237, 0.18)',
  emerald: '#059669',
  emeraldScale: ['#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'],
  amber: '#d97706',
  rose: '#e11d48',
  cyan: '#0891b2',
  orange: '#ea580c',
  pink: '#db2777',
  slate: '#64748b',

  // Doughnut and polar charts need a set that stays distinguishable in order.
  categorical: ['#4f46e5', '#059669', '#d97706', '#0891b2', '#db2777', '#7c3aed', '#ea580c', '#64748b'],

  // Ageing runs amber to red as the debt gets older.
  ageing: ['#94a3b8', '#fbbf24', '#f59e0b', '#ea580c', '#e11d48'],

  ink: '#1f2433',
  inkMuted: '#6b7280',
  gridLine: 'rgba(31, 36, 51, 0.08)',
} as const;

const FONT_FAMILY =
  "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";

/** Shared options. Charts are decoration for numbers shown elsewhere, so they stay plain. */
export function baseChartOptions(money = true): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: CHART_COLORS.ink,
        bodyColor: CHART_COLORS.ink,
        borderColor: 'rgba(31, 36, 51, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
        titleFont: { family: FONT_FAMILY, size: 12, weight: 600 },
        bodyFont: { family: FONT_FAMILY, size: 12 },
        callbacks: money
          ? {
              label: (context) => {
                const label = context.dataset.label ? `${context.dataset.label}: ` : '';
                return label + formatAxisMoney(Number(context.parsed.y ?? context.parsed));
              },
            }
          : undefined,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.inkMuted,
          font: { family: FONT_FAMILY, size: 11 },
          maxRotation: 0,
          autoSkipPadding: 12,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: CHART_COLORS.gridLine },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.inkMuted,
          font: { family: FONT_FAMILY, size: 11 },
          callback: (value) => (money ? formatAxisMoney(Number(value)) : String(value)),
          maxTicksLimit: 6,
        },
      },
    },
  };
}

/** Axis labels get shortened so a six figure total does not crowd the plot. */
export function formatAxisMoney(value: number): string {
  return formatCompact(value);
}

/** Tooltips show the full figure with the symbol, axes stay compact and bare. */
export function formatMoneyFull(value: number): string {
  return formatMoney(value);
}

export function formatPlain(value: number): string {
  return formatAmount(value);
}
