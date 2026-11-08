import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { InvoiceListDto, QueryRequest } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeader } from '../../shared/ui/ui';

type Row = InvoiceListDto & Record<string, unknown>;

@Component({
  selector: 'tt-invoice-list',
  standalone: true,
  imports: [LucideAngularModule, PageHeader, CommonModule, DataGridComponent],
  template: `
    <div class="page-stack">
      <app-page-header title="Invoices" icon="file-text" subtitle="Every completed sale. A void invoice keeps its number and its history, so the trail stays readable.">
        @if (canSell) {
          <div class="contents">
            <a class="btn btn-primary" href="/pos" (click)="goToPos($event)">
              <lucide-icon name="plus" [size]="15" />
              New sale
            </a>
          </div>
        }
      </app-page-header>

      <tt-data-grid
          gridKey="invoices"
          [columns]="columns"
          [dataSource]="dataSource"
          [actions]="actions"
          [defaultSort]="[{ field: 'invoiceDate', desc: true }]"
          searchPlaceholder="Search invoice number or customer"
          emptyTitle="No invoices yet"
          emptyText="Sales completed at the till land here."
          (rowClicked)="open($event)"
        />
    </div>
  `,
})
export class InvoiceListComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly canSell = this.auth.canWrite('Pos');

  readonly columns: GridColumn<Row>[] = [
    { field: 'invoiceNo', header: 'Invoice', kind: 'text', width: 165 },
    { field: 'invoiceDate', header: 'Date', kind: 'date', width: 130 },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150, hidden: true },
    { field: 'customerName', header: 'Customer', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'itemCount', header: 'Lines', kind: 'number', width: 80, hidden: true },
    { field: 'discount', header: 'Discount', kind: 'money', width: 110, hidden: true },
    { field: 'total', header: 'Total', kind: 'money', width: 120 },
    { field: 'paidAmount', header: 'Paid', kind: 'money', width: 110 },
    { field: 'outstanding', header: 'Outstanding', kind: 'money', width: 125 },
    {
      field: 'paymentMethod',
      header: 'Method',
      kind: 'enum',
      width: 105,
      options: ['Cash', 'Card', 'Bank', 'Credit'],
    },
    {
      field: 'status',
      header: 'Status',
      kind: 'enum',
      width: 110,
      options: ['Unpaid', 'Partial', 'Paid', 'Void'],
      html: true,
      render: (row) => `<span class="badge badge-dot tone-${row.status.toLowerCase()}">${row.status}</span>`,
    },
    { field: 'createdBy', header: 'Sold by', kind: 'text', width: 120, hidden: true },
  ];

  readonly actions: GridAction<Row>[] = [
    {
      label: 'Open invoice',
      icon: 'arrow-up-right',
      run: (row) => this.open(row),
    },
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('invoices', request),
    export: (request: QueryRequest) => this.api.export('invoices', request),
  };

  open(row: InvoiceListDto): void {
    void this.router.navigate(['/invoices', row.id]);
  }

  goToPos(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/pos']);
  }
}
