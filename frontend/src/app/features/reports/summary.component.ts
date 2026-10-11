import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';

import { SummaryRowDto } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService, saveBlob } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChartCardComponent } from '../../shared/charts/chart-card.component';
import { CHART_COLORS, baseChartOptions } from '../../shared/charts/chart-palette';
import { longDate, money, monthsAgo, startOfMonth, today } from './report-range';

type Mode = 'daily' | 'monthly';

@Component({
  selector: 'tt-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartCardComponent],
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
  readonly chart = computed<ChartData<'bar'>>(() => {
    const rows = [...this.rows()].reverse();

    return {
      labels: rows.map((r) => r.period),
      datasets: [
        {
          label: 'Net profit',
          data: rows.map((r) => r.netProfit),
          backgroundColor: rows.map((r) =>
            r.netProfit >= 0 ? CHART_COLORS.emerald : CHART_COLORS.rose,
          ),
          borderRadius: 3,
          maxBarThickness: 22,
        },
      ],
    };
  });

  readonly chartOptions = baseChartOptions() as ChartOptions<'bar'>;

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
