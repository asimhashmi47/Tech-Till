import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';

import { DashboardDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { KpiCardComponent } from '../../shared/cards/kpi-card.component';
import { ChartCardComponent } from '../../shared/charts/chart-card.component';
import {
  CHART_COLORS,
  baseChartOptions,
  formatAxisMoney,
  formatMoneyFull,
} from '../../shared/charts/chart-palette';

const ICONS = {
  todaySales: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  monthSales: 'M8 2v4m8-4v4M3 9h18M5 5h14v16H5V5Z',
  grossProfit: 'M12 3v18m5-14H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  expenses: 'M3 7h18v12H3V7Zm0 4h18M7 15h4',
  receivables: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 9 2.5 2.5L16 10',
  payables: 'M3 6h18l-2 13H5L3 6Zm5 0V4a4 4 0 0 1 8 0v2',
  cash: 'M3 6h18v12H3V6Zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  lowStock: 'M12 9v4m0 3.5v.5M10.3 4.9 2.5 19a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.7 4.9a1.6 1.6 0 0 0-2.8 0Z',
  invoice: 'M6 2h9l5 5v15H6V2Zm9 0v5h5M9 13h8M9 17h5',
} as const;

@Component({
  selector: 'tt-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, KpiCardComponent, ChartCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly icons = ICONS;
  readonly data = signal<DashboardDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  // The default window is the last 30 days, today included.
  readonly from = signal(isoDaysAgo(29));
  readonly to = signal(isoToday());

  readonly presets: { label: string; days: number }[] = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: '12 months', days: 365 },
  ];

  /** A reversed pair is still sent, the server swaps it, but the hint says so. */
  readonly rangeInvalid = computed(() => this.from() > this.to());

  readonly rangeLabel = computed(() => {
    const range = this.data()?.range;
    if (!range) {
      return '';
    }

    const days = range.days;
    return `${longDate(range.from)} to ${longDate(range.to)}, ${days} ${days === 1 ? 'day' : 'days'}`;
  });

  readonly bucketLabel = computed(() =>
    this.data()?.range.granularity === 'month' ? 'By month' : 'By day',
  );

  readonly shopLabel = this.auth.activeShopName;
  readonly canSeeInvoices = computed(() => this.auth.canRead('Invoices'));
  readonly canSeeStock = computed(() => this.auth.canRead('Stock'));

  /**
   * Each card leads to the screen its figure comes from. A card only becomes a link when
   * the account can actually open that screen, so a staff user never lands on a 403.
   */
  readonly links = computed(() => ({
    todaySales: this.auth.canRead('Invoices') ? '/invoices' : null,
    monthSales: this.auth.canRead('Reports') ? '/reports/summary' : null,
    grossProfit: this.auth.canRead('Reports') ? '/reports/profit-and-loss' : null,
    expenses: this.auth.canRead('Expenses') ? '/expenses' : null,
    receivables: this.auth.canRead('Customers') ? '/receivables' : null,
    payables: this.auth.canRead('Suppliers') ? '/payables' : null,
    cashInHand: this.auth.canRead('PettyCash') ? '/petty-cash' : null,
    lowStock: this.auth.canRead('Stock') ? '/stock' : null,
  }));

  constructor() {
    // Reloads whenever the shop switcher changes.
    effect(() => {
      // Re-reads whenever the shop switcher changes; the date range reloads on Apply.
      const shopId = this.auth.activeShopId();
      this.load(shopId);
    });
  }

  load(shopId: number | null): void {
    this.loading.set(true);
    this.failed.set(false);

    this.api.get<DashboardDto>('dashboard', { shopId, from: this.from(), to: this.to() }).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  retry(): void {
    this.load(this.auth.activeShopId());
  }

  apply(): void {
    this.load(this.auth.activeShopId());
  }

  /** Preset windows all end today, which is what a shop owner means by "last 30 days". */
  applyPreset(days: number): void {
    this.from.set(isoDaysAgo(days - 1));
    this.to.set(isoToday());
    this.load(this.auth.activeShopId());
  }

  isPresetActive(days: number): boolean {
    return this.from() === isoDaysAgo(days - 1) && this.to() === isoToday();
  }

  readonly kpi = computed(() => this.data()?.kpi ?? null);

  // ---------- Chart 1: sales against expenses, grouped bar ----------
  readonly salesVsExpenses = computed<ChartData<'bar'>>(() => {
    const rows = this.data()?.salesVsExpenses ?? [];

    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: 'Sales',
          data: rows.map((r) => r.first),
          backgroundColor: CHART_COLORS.indigo,
          borderRadius: 3,
          maxBarThickness: 18,
        },
        {
          label: 'Expenses',
          data: rows.map((r) => r.second),
          backgroundColor: CHART_COLORS.rose,
          borderRadius: 3,
          maxBarThickness: 18,
        },
      ],
    };
  });

  readonly groupedBarOptions: ChartOptions<'bar'> = {
    ...(baseChartOptions() as ChartOptions<'bar'>),
    plugins: {
      ...(baseChartOptions().plugins ?? {}),
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
        },
      },
    },
  };

  // ---------- Chart 2: daily sales, smooth area line ----------
  readonly dailySales = computed<ChartData<'line'>>(() => {
    const rows = this.data()?.dailySales ?? [];

    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: 'Sales',
          data: rows.map((r) => r.value),
          borderColor: CHART_COLORS.violet,
          backgroundColor: CHART_COLORS.violetSoft,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: CHART_COLORS.violet,
        },
      ],
    };
  });

  readonly lineOptions = baseChartOptions() as ChartOptions<'line'>;

  // ---------- Chart 3: sales by category, doughnut ----------
  readonly salesByCategory = computed<ChartData<'doughnut'>>(() => {
    const rows = this.data()?.salesByCategory ?? [];

    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          data: rows.map((r) => r.value),
          backgroundColor: [...CHART_COLORS.categorical],
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  });

  readonly doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          padding: 10,
        },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: CHART_COLORS.ink,
        bodyColor: CHART_COLORS.ink,
        borderColor: 'rgba(31, 36, 51, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => ` ${context.label}: ${formatMoneyFull(Number(context.parsed))}`,
        },
      },
    },
  };

  // ---------- Chart 4: top products, horizontal bar ----------
  readonly topProducts = computed<ChartData<'bar'>>(() => {
    const rows = this.data()?.topProducts ?? [];

    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: 'Sales',
          data: rows.map((r) => r.value),
          backgroundColor: rows.map(
            (_, index) => CHART_COLORS.emeraldScale[index % CHART_COLORS.emeraldScale.length],
          ),
          borderRadius: 3,
          maxBarThickness: 20,
        },
      ],
    };
  });

  readonly horizontalBarOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: CHART_COLORS.ink,
        bodyColor: CHART_COLORS.ink,
        borderColor: 'rgba(31, 36, 51, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => ` ${formatMoneyFull(Number(context.parsed.x))}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: CHART_COLORS.gridLine },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          callback: (value) => formatAxisMoney(Number(value)),
          maxTicksLimit: 5,
        },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          crossAlign: 'far',
          callback(value) {
            const label = String(this.getLabelForValue(Number(value)));
            return label.length > 24 ? `${label.slice(0, 23)}...` : label;
          },
        },
      },
    },
  };

  // ---------- Chart 5: receivable ageing, stacked bar ----------
  readonly ageing = computed<ChartData<'bar'>>(() => {
    const summary = this.data()?.receivableAgeing;
    const buckets = [
      { label: 'Current', value: summary?.current ?? 0 },
      { label: '1 to 30', value: summary?.days1To30 ?? 0 },
      { label: '31 to 60', value: summary?.days31To60 ?? 0 },
      { label: '61 to 90', value: summary?.days61To90 ?? 0 },
      { label: 'Over 90', value: summary?.over90 ?? 0 },
    ];

    return {
      labels: ['Receivable'],
      datasets: buckets.map((bucket, index) => ({
        label: bucket.label,
        data: [bucket.value],
        backgroundColor: CHART_COLORS.ageing[index],
        borderRadius: 2,
        maxBarThickness: 46,
      })),
    };
  });

  readonly stackedOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: CHART_COLORS.ink,
        bodyColor: CHART_COLORS.ink,
        borderColor: 'rgba(31, 36, 51, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: ${formatMoneyFull(Number(context.parsed.x))}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        grid: { color: CHART_COLORS.gridLine },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          callback: (value) => formatAxisMoney(Number(value)),
          maxTicksLimit: 5,
        },
      },
      y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { display: false } },
    },
  };

  // ---------- Chart 6: shop comparison, polar area ----------
  readonly shopSales = computed<ChartData<'polarArea'>>(() => {
    const rows = this.data()?.shopSales ?? [];

    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          data: rows.map((r) => r.value),
          backgroundColor: ['rgba(8, 145, 178, 0.68)', 'rgba(79, 70, 229, 0.62)', 'rgba(13, 148, 136, 0.6)', 'rgba(124, 58, 237, 0.56)'],
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  });

  readonly polarOptions: ChartOptions<'polarArea'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          color: CHART_COLORS.inkMuted,
          font: { size: 11 },
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: CHART_COLORS.ink,
        bodyColor: CHART_COLORS.ink,
        borderColor: 'rgba(31, 36, 51, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => ` ${context.label}: ${formatMoneyFull(Number(context.parsed.r ?? context.parsed))}`,
        },
      },
    },
    scales: {
      r: {
        grid: { color: CHART_COLORS.gridLine },
        ticks: {
          backdropColor: 'transparent',
          color: CHART_COLORS.inkMuted,
          font: { size: 10 },
          callback: (value) => formatAxisMoney(Number(value)),
          maxTicksLimit: 4,
        },
      },
    },
  };

  // ---------- Helpers for the lists ----------

  money(value: number): string {
    return formatMoneyFull(value);
  }

  statusClass(status: string): string {
    return `tt-chip tt-chip--${status.toLowerCase()}`;
  }

  hasData(rows: { value: number }[] | undefined): boolean {
    return !!rows && rows.some((row) => row.value > 0);
  }

  get ageingHasData(): boolean {
    return (this.data()?.receivableAgeing.total ?? 0) > 0;
  }
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function longDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
