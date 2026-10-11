import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CashFlowDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RANGE_PRESETS, longDate, money, startOfMonth, today } from './report-range';

@Component({
  selector: 'tt-cash-flow',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-flow.component.html',
  styleUrl: './reports.scss',
})
export class CashFlowComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly presets = RANGE_PRESETS;
  readonly from = signal(startOfMonth());
  readonly to = signal(today());
  readonly data = signal<CashFlowDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly shopLabel = this.auth.activeShopName;

  readonly reconciles = computed(() => {
    const d = this.data();
    if (!d) {
      return true;
    }

    return Math.abs(d.openingCash + d.netCashFlow - d.closingCash) < 0.01;
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
      .get<CashFlowDto>('reports/cash-flow', {
        shopId: this.auth.activeShopId(),
        from: this.from(),
        to: this.to(),
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

  applyPreset(index: number): void {
    const preset = this.presets[index];
    this.from.set(preset.from());
    this.to.set(preset.to());
    this.load();
  }

  money(value: number): string {
    return money(value);
  }

  longDate(value: string): string {
    return longDate(value);
  }
}
