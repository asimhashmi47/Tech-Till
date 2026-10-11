import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { CustomerPaymentDto, QueryRequest } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridColumn } from '../../shared/grid/grid.models';

type Row = CustomerPaymentDto & Record<string, unknown>;

/** Payment history for customers, the receipts side of the ledger. */
@Component({
  selector: 'tt-receipt-list',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  template: `
    <div class="tt-page">
      <header class="tt-page-head">
        <div class="tt-page-head__text">
          <h1 class="tt-page-head__title">Customer receipts</h1>
          <p class="tt-page-head__sub">
            Every payment taken from a customer, whether at the till or against an account later.
          </p>
        </div>
      </header>

      <div class="tt-panel">
        <tt-data-grid
          gridKey="customer-receipts"
          [columns]="columns"
          [dataSource]="dataSource"
          [defaultSort]="[{ field: 'receivedAt', desc: true }]"
          searchPlaceholder="Search customer, invoice or note"
          emptyTitle="No receipts yet"
          emptyText="Payments appear here as soon as money is taken."
        />
      </div>
    </div>
  `,
})
export class ReceiptListComponent {
  private readonly api = inject(ApiService);

  readonly columns: GridColumn<Row>[] = [
    { field: 'receivedAt', header: 'Date', kind: 'date', width: 130 },
    { field: 'customerName', header: 'Customer', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'invoiceNo', header: 'Against invoice', kind: 'text', width: 165 },
    { field: 'amount', header: 'Amount', kind: 'money', width: 125 },
    {
      field: 'method',
      header: 'Method',
      kind: 'enum',
      width: 105,
      options: ['Cash', 'Card', 'Bank', 'Credit'],
    },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    { field: 'note', header: 'Note', kind: 'text', flex: 2, minWidth: 160, hidden: true },
    { field: 'createdBy', header: 'Recorded by', kind: 'text', width: 130, hidden: true },
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('customers/payments', request),
    export: (request: QueryRequest) => this.api.export('customers/payments', request),
  };
}
