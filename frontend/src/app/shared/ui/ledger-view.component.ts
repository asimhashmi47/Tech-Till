import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LedgerDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatMoney } from '../../core/services/currency';

/**
 * Running balance statement for one customer or supplier. Debit, credit and a balance
 * that carries down the page, which is what a shop owner expects a ledger to look like.
 */
@Component({
  selector: 'tt-ledger-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ledger-view.component.html',
  styleUrl: './ledger-view.component.scss',
})
export class LedgerViewComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** `customers` or `suppliers`. */
  readonly resource = input.required<'customers' | 'suppliers'>();
  readonly partyId = input.required<string>();
  readonly backLink = input.required<string>();
  readonly backLabel = input.required<string>();

  /** What a positive closing balance means for this party. */
  readonly balanceLabel = input.required<string>();

  readonly ledger = signal<LedgerDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly from = signal('');
  readonly to = signal('');

  readonly totals = computed(() => {
    const rows = this.ledger()?.rows ?? [];
    return {
      debit: rows.reduce((sum, row) => sum + row.debit, 0),
      credit: rows.reduce((sum, row) => sum + row.credit, 0),
    };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.api
      .get<LedgerDto>(`${this.resource()}/${this.partyId()}/ledger`, {
        shopId: this.auth.activeShopId(),
        from: this.from() || null,
        to: this.to() || null,
      })
      .subscribe({
        next: (result) => {
          this.ledger.set(result);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  clearDates(): void {
    this.from.set('');
    this.to.set('');
    this.load();
  }

  money(value: number): string {
    return formatMoney(value);
  }

  date(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
