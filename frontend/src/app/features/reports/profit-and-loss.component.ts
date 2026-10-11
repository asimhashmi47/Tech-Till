import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ProfitAndLossDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RANGE_PRESETS, longDate, money, startOfMonth, today } from './report-range';

@Component({
  selector: 'tt-profit-and-loss',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profit-and-loss.component.html',
  styleUrl: './reports.scss',
})
export class ProfitAndLossComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly presets = RANGE_PRESETS;
  readonly from = signal(startOfMonth());
  readonly to = signal(today());
  readonly data = signal<ProfitAndLossDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly shopLabel = this.auth.activeShopName;

  readonly marginPercent = computed(() => {
    const d = this.data();
    if (!d || d.revenue <= 0) {
      return 0;
    }

    return Math.round((d.grossProfit / d.revenue) * 100);
  });

  readonly netPercent = computed(() => {
    const d = this.data();
    if (!d || d.revenue <= 0) {
      return 0;
    }

    return Math.round((d.netProfit / d.revenue) * 100);
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
      .get<ProfitAndLossDto>('reports/profit-and-loss', {
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
