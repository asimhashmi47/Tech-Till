import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertService } from '../../core/services/alert.service';
import { CurrencyOption, formatMoney } from '../../core/services/currency';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Owner only. Currency is stored on the server, so changing it here changes every money
 * figure for every user and every device, not just this browser.
 */
@Component({
  selector: 'tt-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly settings = inject(SettingsService);
  private readonly alerts = inject(AlertService);

  readonly options = signal<CurrencyOption[]>([]);
  readonly selected = signal<string>('');
  readonly saving = signal(false);
  readonly loading = signal(true);

  readonly current = this.settings.currency;

  readonly chosen = computed<CurrencyOption | null>(
    () => this.options().find((option) => option.code === this.selected()) ?? null,
  );

  readonly isDirty = computed(() => this.selected() !== this.current().code);

  /** A real figure from the shop, so the effect of the choice is visible before saving. */
  readonly sample = computed(() => {
    const option = this.chosen();
    if (!option) {
      return '';
    }

    const text = (1234567.5).toLocaleString('en-US', {
      minimumFractionDigits: option.decimals,
      maximumFractionDigits: option.decimals,
    });

    return option.symbolFirst ? `${option.symbol} ${text}` : `${text} ${option.symbol}`;
  });

  ngOnInit(): void {
    this.settings.load().subscribe({
      next: (result) => {
        this.options.set(result.available);
        this.selected.set(result.currency.code);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    const option = this.chosen();
    if (!option || !this.isDirty()) {
      return;
    }

    this.saving.set(true);
    this.settings.save(option.code).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.alerts.success(
          `Currency is now ${result.currency.name}`,
          `Money shows as ${formatMoney(1234.5)} everywhere`,
        );
      },
      error: () => this.saving.set(false),
    });
  }

  revert(): void {
    this.selected.set(this.current().code);
  }
}
