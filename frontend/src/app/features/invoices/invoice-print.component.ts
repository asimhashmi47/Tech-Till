import { CommonModule } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';

import { InvoiceDetailDto } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatMoney } from '../../core/services/currency';

type PaperSize = 'a4' | 'thermal';

/**
 * Printable invoice, outside the app shell so no sidebar or top bar reaches the paper.
 * One markup tree serves both sizes; the stylesheet changes the page box and the scale.
 */
@Component({
  selector: 'tt-invoice-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-print.component.html',
  styleUrl: './invoice-print.component.scss',
})
export class InvoicePrintComponent {
  private readonly api = inject(ApiService);

  readonly id = input.required<string>();

  readonly invoice = signal<InvoiceDetailDto | null>(null);
  readonly loading = signal(true);
  readonly paper = signal<PaperSize>('a4');

  ngOnInit(): void {
    this.api.get<InvoiceDetailDto>(`invoices/${this.id()}`).subscribe({
      next: (result) => {
        this.invoice.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setPaper(size: PaperSize): void {
    this.paper.set(size);
  }

  print(): void {
    window.print();
  }

  close(): void {
    window.close();
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
