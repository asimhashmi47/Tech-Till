import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApexOptions } from 'ng-apexcharts';

import { SummaryRowDto } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService, saveBlob } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatCompact } from '../../core/services/currency';
import { Chart, PALETTE, baseChart } from '../../shared/charts/chart';
import { longDate, money, monthsAgo, startOfMonth, today } from './report-range';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeader } from '../../shared/ui/ui';

type Mode = 'daily' | 'monthly';

@Component({
  selector: 'tt-summary',
  standalone: true,
  imports: [LucideAngularModule, PageHeader, CommonModule, FormsModule, Chart],
  templateUrl: './summary.component.html',
  styleUrl: './reports.scss',
})
export class SummaryComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  readonly mode = signal<Mode>('daily');
  readonly from = signal(startOfMonth());
  readonly to = signal(today());
  readonly rows = signal<SummaryRowDto[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly exporting = signal(false);

  readonly shopLabel = this.auth.activeShopName;

  readonly totals = computed(() => {
    const rows = this.rows();

    return {
      invoiceCount: rows.reduce((sum, r) => sum + r.invoiceCount, 0),
      sales: rows.reduce((sum, r) => sum + r.sales, 0),
      discount: rows.reduce((sum, r) => sum + r.discount, 0),
      cogs: rows.reduce((sum, r) => sum + r.cogs, 0),
      grossProfit: rows.reduce((sum, r) => sum + r.grossProfit, 0),
      expenses: rows.reduce((sum, r) => sum + r.expenses, 0),
      netProfit: rows.reduce((sum, r) => sum + r.netProfit, 0),
      receipts: rows.reduce((sum, r) => sum + r.receipts, 0),
      purchases: rows.reduce((sum, r) => sum + r.purchases, 0),
    };
  });

  /** The table reads newest first, the chart reads left to right in time. */
  readonly chart = computed<ApexOptions>(() => {
    const rows = [...this.rows()].reverse();

    return {
      chart: baseChart('bar', 240),
      series: [{ name: 'Net profit', data: rows.map((r) => r.netProfit) }],
      colors: [PALETTE[0]],
      plotOptions: {
        bar: {
          columnWidth: '56%',
          borderRadius: 3,
          colors: { ranges: [{ from: Number.MIN_SAFE_INTEGER, to: -0.01, color: PALETTE[4] }] },
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: rows.map((r) => r.period),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#6f6879' }, rotate: 0, hideOverlappingLabels: true },
        tickAmount: 10,
      },
      yaxis: { labels: { formatter: (v: number) => formatCompact(v), style: { colors: '#6f6879' } } },
      grid: { borderColor: '#ece6f5', strokeDashArray: 4 },
      tooltip: { y: { formatter: (v: number | null) => money(v ?? 0) } },
    };
  });

  readonly hasData = computed(() => this.rows().some((r) => r.sales > 0 || r.expenses > 0));

  constructor() {
    effect(() => {
      this.auth.activeShopId();
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.api
      .get<SummaryRowDto[]>(`reports/${this.mode()}`, {
        shopId: this.auth.activeShopId(),
        from: this.from(),
        to: this.to(),
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);

    // Monthly over one month is not useful, so the range widens with the view.
    this.from.set(mode === 'monthly' ? monthsAgo(11) : startOfMonth());
    this.to.set(today());
    this.load();
  }

  exportExcel(): void {
    this.exporting.set(true);

    this.api
      .exportGet('reports/summary/export', {
        shopId: this.auth.activeShopId(),
        from: this.from(),
        to: this.to(),
        monthly: this.mode() === 'monthly',
      })
      .subscribe({
        next: (download) => {
          saveBlob(download);
          this.exporting.set(false);
          this.alerts.success('Export ready', download.filename);
        },
        error: () => this.exporting.set(false),
      });
  }

  money(value: number): string {
    return money(value);
  }

  longDate(value: string): string {
    return longDate(value);
  }
}
