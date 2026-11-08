import { CommonModule } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  CustomerDto,
  PaymentMethod,
  QueryRequest,
  SaveCustomerRequest,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { formatMoney } from '../../core/services/currency';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeader } from '../../shared/ui/ui';

type Row = CustomerDto & Record<string, unknown>;

const BLANK: SaveCustomerRequest = { name: '', phone: '', address: '', isActive: true };

@Component({
  selector: 'tt-customer-list',
  standalone: true,
  imports: [LucideAngularModule, PageHeader, CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './customer-list.component.html',
})
export class CustomerListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly canWrite = this.auth.canWrite('Customers');

  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly form = signal<SaveCustomerRequest>({ ...BLANK });
  readonly error = signal('');

  // Receipt drawer
  readonly receiptOpen = signal(false);
  readonly receiptSaving = signal(false);
  readonly receiptCustomer = signal<CustomerDto | null>(null);
  readonly receiptAmount = signal(0);
  readonly receiptMethod = signal<PaymentMethod>('Cash');
  readonly receiptNote = signal('');
  readonly receiptError = signal('');

  readonly shopId = this.auth.activeShopId;
  readonly shops = this.auth.shops;
  readonly receiptShopId = signal<number | null>(null);

  readonly columns: GridColumn<Row>[] = [
    { field: 'name', header: 'Customer', kind: 'text', flex: 2, minWidth: 190 },
    { field: 'phone', header: 'Phone', kind: 'text', width: 140 },
    { field: 'address', header: 'Address', kind: 'text', flex: 2, minWidth: 170 },
    { field: 'receivable', header: 'Receivable', kind: 'money', width: 130 },
    {
      field: 'isWalkIn',
      header: 'Type',
      kind: 'bool',
      width: 110,
      html: true,
      render: (row) =>
        row.isWalkIn
          ? '<span class="badge badge-dot tone-info">Walk-in</span>'
          : '<span class="badge badge-dot tone-neutral">Account</span>',
    },
    {
      field: 'isActive',
      header: 'Status',
      kind: 'bool',
      width: 100,
      hidden: true,
      html: true,
      render: (row) =>
        row.isActive
          ? '<span class="badge badge-dot tone-success">Active</span>'
          : '<span class="badge badge-dot tone-neutral">Inactive</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = [
    {
      label: 'Open ledger',
      icon: 'book-open',
      run: (row) => void this.router.navigate(['/customers', row.id, 'ledger']),
    },
    ...(this.canWrite
      ? [
          {
            label: 'Record a receipt',
            icon: 'receipt',
            run: (row: Row) => this.openReceipt(row),
            visible: (row: Row) => row.receivable > 0,
          },
          {
            label: 'Edit customer',
            icon: 'pencil',
            run: (row: Row) => this.edit(row),
          },
          {
            label: 'Remove customer',
            icon: 'trash-2',
            kind: 'danger' as const,
            run: (row: Row) => void this.remove(row),
            visible: (row: Row) => !row.isWalkIn,
          },
        ]
      : []),
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('customers', request),
    export: (request: QueryRequest) => this.api.export('customers', request),
  };

  create(): void {
    this.editingId.set(null);
    this.error.set('');
    this.form.set({ ...BLANK });
    this.drawerOpen.set(true);
  }

  edit(row: CustomerDto): void {
    this.editingId.set(row.id);
    this.error.set('');
    this.form.set({
      name: row.name,
      phone: row.phone ?? '',
      address: row.address ?? '',
      isActive: row.isActive,
    });
    this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  patch<K extends keyof SaveCustomerRequest>(key: K, value: SaveCustomerRequest[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  save(): void {
    const body = this.form();

    if (!body.name.trim()) {
      this.error.set('A customer name is required.');
      return;
    }

    this.error.set('');
    this.saving.set(true);

    const id = this.editingId();
    const request = id
      ? this.api.put<CustomerDto>(`customers/${id}`, body)
      : this.api.post<CustomerDto>('customers', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(id ? 'Customer updated' : 'Customer added', saved.name);
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  // ---------- Receipts ----------

  openReceipt(row: CustomerDto): void {
    this.receiptCustomer.set(row);
    this.receiptAmount.set(row.receivable);
    this.receiptMethod.set('Cash');
    this.receiptNote.set('');
    this.receiptError.set('');
    this.receiptShopId.set(this.shopId() ?? this.shops()[0]?.id ?? null);
    this.receiptOpen.set(true);
  }

  closeReceipt(): void {
    this.receiptOpen.set(false);
  }

  saveReceipt(): void {
    const customer = this.receiptCustomer();
    const shopId = this.receiptShopId();

    if (!customer) {
      return;
    }

    if (shopId === null) {
      this.receiptError.set('Choose the shop that received the money.');
      return;
    }

    const amount = this.receiptAmount();

    if (amount <= 0) {
      this.receiptError.set('Enter an amount above zero.');
      return;
    }

    if (amount > customer.receivable) {
      this.receiptError.set(`That is more than the ${this.money(customer.receivable)} owed.`);
      return;
    }

    this.receiptError.set('');
    this.receiptSaving.set(true);

    this.api
      .post('customers/payments', {
        shopId,
        customerId: customer.id,
        salesInvoiceId: null,
        receivedAt: new Date().toISOString(),
        amount,
        method: this.receiptMethod(),
        note: this.receiptNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.receiptSaving.set(false);
          this.receiptOpen.set(false);
          this.alerts.success('Receipt recorded', `${this.money(amount)} from ${customer.name}`);
          this.grid()?.refresh();
        },
        error: () => this.receiptSaving.set(false),
      });
  }

  money(value: number): string {
    return formatMoney(value);
  }

  private async remove(row: CustomerDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: `Remove ${row.name}?`,
      message:
        'A customer with invoices is made inactive instead of deleted, so their ledger stays readable.',
      confirmLabel: 'Remove customer',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`customers/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Customer removed', row.name);
        this.grid()?.refresh();
      },
    });
  }
}
