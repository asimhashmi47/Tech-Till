import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BalanceSheetDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { longDate, money, today } from './report-range';

@Component({
  selector: 'tt-balance-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './balance-sheet.component.html',
  styleUrl: './reports.scss',
})
export class BalanceSheetComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly asAt = signal(today());
  readonly data = signal<BalanceSheetDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly shopLabel = this.auth.activeShopName;

  /**
   * The sheet balances by construction, because equity is the residual. Showing the check
   * anyway means a future change that breaks the identity is visible immediately.
   */
  readonly balances = computed(() => {
    const d = this.data();
    if (!d) {
      return true;
    }

    return Math.abs(d.totalAssets - (d.totalLiabilities + d.ownerEquity)) < 0.01;
  });

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
      .get<BalanceSheetDto>('reports/balance-sheet', {
        shopId: this.auth.activeShopId(),
        to: this.asAt(),
      })
      .subscribe({
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

  money(value: number): string {
    return money(value);
  }

  longDate(value: string): string {
    return longDate(value);
  }
}
