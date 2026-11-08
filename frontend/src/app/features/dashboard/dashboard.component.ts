import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApexOptions } from 'ng-apexcharts';

import { DashboardDto, SeriesPointDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatCompact, formatMoney } from '../../core/services/currency';
import { CHART_FONT, Chart, LAVENDER, PALETTE, baseChart } from '../../shared/charts/chart';
import { PageHeader, Stat } from '../../shared/ui/ui';

const AXIS_INK = '#6f6879';
const GRID_LINE = '#ece6f5';
const axisLabels = { style: { colors: AXIS_INK } };

interface Tile {
  label: string;
  value: string;
  icon: string;
  tone: 'brand' | 'mint' | 'amber' | 'danger' | 'teal' | 'orchid';
  caption: string;
  route: string | null;
}

@Component({
  selector: 'tt-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, PageHeader, Stat, Chart],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

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

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.auth.profile()?.fullName.split(' ')[0] ?? ''}`;
  });

  readonly subtitle = computed(() => {
    const range = this.data()?.range;
    const shop = this.auth.activeShopName();
    if (!range) return shop;
    const days = `${range.days} ${range.days === 1 ? 'day' : 'days'}`;
    return `${shop}, ${longDate(range.from)} to ${longDate(range.to)}, ${days}`;
  });

  readonly bucketLabel = computed(() =>
    this.data()?.range.granularity === 'month' ? 'By month' : 'By day',
  );

  readonly canSell = computed(() => this.auth.canWrite('Pos'));
  readonly canSeeInvoices = computed(() => this.auth.canRead('Invoices'));
  readonly canSeeStock = computed(() => this.auth.canRead('Stock'));

  /**
   * Each tile leads to the screen its figure comes from. A tile only becomes a link when
   * the account can actually open that screen, so a staff user never lands on a 403.
   */
  readonly tiles = computed<Tile[]>(() => {
    const k = this.data()?.kpi;
    if (!k) return [];
    const can = this.auth;
    return [
      {
        label: 'Today sales',
        value: formatMoney(k.todaySales),
        icon: 'shopping-cart',
        tone: 'brand',
        caption: 'Invoices raised today',
        route: can.canRead('Invoices') ? '/invoices' : null,
      },
      {
        label: 'Sales in range',
        value: formatMoney(k.periodSales),
        icon: 'calendar-range',
        tone: 'orchid',
        caption: 'In the selected range',
        route: can.canRead('Reports') ? '/reports/summary' : null,
      },
      {
        label: 'Gross profit',
        value: formatMoney(k.grossProfit),
        icon: 'trending-up',
        tone: 'mint',
        caption: 'Sales less cost of goods',
        route: can.canRead('Reports') ? '/reports/profit-and-loss' : null,
      },
      {
        label: 'Expenses',
        value: formatMoney(k.expenses),
        icon: 'wallet',
        tone: 'danger',
        caption: 'In the selected range',
        route: can.canRead('Expenses') ? '/expenses' : null,
      },
      {
        label: 'Receivables',
        value: formatMoney(k.receivables),
        icon: 'hand-coins',
        tone: 'amber',
        caption: 'Owed as at the end date',
        route: can.canRead('Customers') ? '/receivables' : null,
      },
      {
        label: 'Payables',
        value: formatMoney(k.payables),
        icon: 'banknote',
        tone: 'amber',
        caption: 'Owed as at the end date',
        route: can.canRead('Suppliers') ? '/payables' : null,
      },
      {
        label: 'Cash in hand',
        value: formatMoney(k.cashInHand),
        icon: 'coins',
        tone: 'teal',
        caption: 'Across the drawers',
        route: can.canRead('PettyCash') ? '/petty-cash' : null,
      },
      {
        label: 'Low stock items',
        value: Math.round(k.lowStockItems).toLocaleString('en-US'),
        icon: 'triangle-alert',
        tone: 'orchid',
        caption: 'At or below reorder level',
        route: can.canRead('Stock') ? '/stock' : null,
      },
    ];
  });

  readonly salesChart = computed<ApexOptions | null>(() => {
    const rows = this.data()?.salesVsExpenses;
    if (!rows) return null;
    return {
      chart: baseChart('bar', 300),
      series: [
        { name: 'Sales', data: rows.map((r) => r.first) },
        { name: 'Expenses', data: rows.map((r) => r.second) },
      ],
      colors: [PALETTE[0], LAVENDER[3]],
      plotOptions: { bar: { columnWidth: '52%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: rows.map((r) => r.label),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: axisLabels,
      },
      yaxis: { labels: { formatter: (v: number) => formatCompact(v), ...axisLabels } },
      grid: { borderColor: GRID_LINE, strokeDashArray: 4 },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        fontFamily: CHART_FONT,
        markers: { size: 5 },
      },
      tooltip: { shared: true, intersect: false, y: { formatter: moneyLabel } },
    };
  });

  readonly trendChart = computed<ApexOptions | null>(() => {
    const rows = this.data()?.dailySales;
    if (!rows) return null;
    return {
      chart: baseChart('area', 260),
      series: [{ name: 'Sales', data: rows.map((r) => r.value) }],
      colors: [PALETTE[0]],
      stroke: { width: 3, curve: 'monotoneCubic' },
      fill: { type: 'solid', opacity: 0.14 },
      dataLabels: { enabled: false },
      markers: { size: 0, hover: { size: 5 } },
      xaxis: {
        categories: rows.map((r) => r.label),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { ...axisLabels, rotate: 0, hideOverlappingLabels: true },
        tickAmount: 8,
      },
      yaxis: { labels: { formatter: (v: number) => formatCompact(v), ...axisLabels } },
      grid: { borderColor: GRID_LINE, strokeDashArray: 4 },
      tooltip: { y: { formatter: moneyLabel } },
    };
  });

  readonly categoryChart = computed<ApexOptions | null>(() => {
    const rows = this.data()?.salesByCategory;
    if (!rows) return null;
    return {
      chart: baseChart('donut', 260),
      series: rows.map((r) => r.value),
      labels: rows.map((r) => r.label),
      colors: [...PALETTE],
      stroke: { width: 2, colors: ['#fff'] },
      dataLabels: { enabled: false },
      legend: { position: 'right', fontFamily: CHART_FONT, fontSize: '12px', markers: { size: 5 } },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              value: { formatter: (v: string) => formatCompact(Number(v)) },
              total: {
                show: true,
                label: 'Sales',
                fontFamily: CHART_FONT,
                color: AXIS_INK,
                formatter: () => formatCompact(rows.reduce((sum, r) => sum + r.value, 0)),
              },
            },
          },
        },
      },
      tooltip: { y: { formatter: moneyLabel } },
    };
  });

  readonly productChart = computed<ApexOptions | null>(() => {
    const rows = this.data()?.topProducts;
    if (!rows) return null;
    return {
      chart: baseChart('bar', 260),
      series: [{ name: 'Sales', data: rows.map((r) => r.value) }],
      colors: [PALETTE[0]],
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '62%' } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: rows.map((r) => truncate(r.label)),
        labels: { formatter: (v: string) => formatCompact(Number(v)), ...axisLabels },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { maxWidth: 150, ...axisLabels } },
      grid: { borderColor: GRID_LINE, strokeDashArray: 4 },
      tooltip: { y: { formatter: moneyLabel } },
    };
  });

  readonly ageingChart = computed<ApexOptions | null>(() => {
    const s = this.data()?.receivableAgeing;
    if (!s) return null;
    return {
      chart: baseChart('bar', 260),
      series: [{ name: 'Receivable', data: [s.current, s.days1To30, s.days31To60, s.days61To90, s.over90] }],
      // Pale for money that is current, deepening as the debt gets older.
      colors: [LAVENDER[2], LAVENDER[3], PALETTE[3], PALETTE[4], PALETTE[0]],
      plotOptions: { bar: { distributed: true, columnWidth: '56%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        categories: ['Current', '1 to 30', '31 to 60', '61 to 90', 'Over 90'],
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: axisLabels,
      },
      yaxis: { labels: { formatter: (v: number) => formatCompact(v), ...axisLabels } },
      grid: { borderColor: GRID_LINE, strokeDashArray: 4 },
      tooltip: { y: { formatter: moneyLabel } },
    };
  });

  readonly shopChart = computed<ApexOptions | null>(() => {
    const rows = this.data()?.shopSales;
    if (!rows) return null;
    return {
      chart: baseChart('polarArea', 260),
      series: rows.map((r) => r.value),
      labels: rows.map((r) => r.label),
      colors: [...PALETTE],
      fill: { opacity: 0.85 },
      stroke: { width: 2, colors: ['#fff'] },
      dataLabels: { enabled: false },
      legend: { position: 'bottom', fontFamily: CHART_FONT, fontSize: '12px', markers: { size: 5 } },
      yaxis: { labels: { formatter: (v: number) => formatCompact(v), ...axisLabels } },
      tooltip: { y: { formatter: moneyLabel } },
    };
  });

  readonly ageingHasData = computed(() => (this.data()?.receivableAgeing.total ?? 0) > 0);

  constructor() {
    // Re-reads whenever the shop switcher changes; the date range reloads on Apply.
    effect(() => {
      this.load(this.auth.activeShopId());
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

  money(value: number): string {
    return formatMoney(value);
  }

  hasData(rows: SeriesPointDto[] | undefined): boolean {
    return !!rows && rows.some((row) => row.value > 0);
  }
}

function moneyLabel(value: number | null): string {
  return formatMoney(value ?? 0);
}

function truncate(label: string): string {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
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
