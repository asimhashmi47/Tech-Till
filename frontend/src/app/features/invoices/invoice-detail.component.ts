import { CommonModule } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { InvoiceDetailDto } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatMoney } from '../../core/services/currency';

@Component({
  selector: 'tt-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './invoice-detail.component.html',
  styleUrl: './invoice-detail.component.scss',
})
export class InvoiceDetailComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the route by withComponentInputBinding. */
  readonly id = input.required<string>();

  readonly invoice = signal<InvoiceDetailDto | null>(null);
  readonly loading = signal(true);
  readonly voiding = signal(false);

  readonly isAdmin = this.auth.isAdmin;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<InvoiceDetailDto>(`invoices/${this.id()}`).subscribe({
      next: (result) => {
        this.invoice.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  print(): void {
    // The print view is its own route outside the shell, so nothing else prints.
    window.open(`/print/invoice/${this.id()}`, '_blank', 'noopener');
  }

  async voidInvoice(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }

    const reason = await this.alerts.confirmWithReason({
      title: `Void ${invoice.invoiceNo}?`,
      message:
        'Stock goes back on the shelf and any money recorded against this invoice is reversed. The invoice stays in the list, marked void.',
      inputLabel: 'Reason for voiding',
      placeholder: 'For example: wrong item scanned',
      confirmLabel: 'Void invoice',
    });

    if (!reason) {
      return;
    }

    this.voiding.set(true);
    this.api.post<InvoiceDetailDto>(`invoices/${invoice.id}/void`, { reason }).subscribe({
      next: (updated) => {
        this.invoice.set(updated);
        this.voiding.set(false);
        this.alerts.success('Invoice voided', `${updated.invoiceNo} reversed`);
      },
      error: () => this.voiding.set(false),
    });
  }

  back(): void {
    void this.router.navigate(['/invoices']);
  }

  money(value: number): string {
    return formatMoney(value);
  }

  dateTime(value: string): string {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
