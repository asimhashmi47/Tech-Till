import { CommonModule } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { QueryRequest, SaveSupplierRequest, SupplierDto } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';

type Row = SupplierDto & Record<string, unknown>;

const BLANK: SaveSupplierRequest = { name: '', phone: '', address: '', isActive: true };

@Component({
  selector: 'tt-supplier-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  template: `
    <div class="tt-page">
      <header class="tt-page-head">
        <div class="tt-page-head__text">
          <h1 class="tt-page-head__title">Suppliers</h1>
          <p class="tt-page-head__sub">
            Payable is what is still owed on bills for the shops you can see.
          </p>
        </div>

        @if (canWrite) {
          <div class="tt-page-head__actions">
            <button type="button" class="tt-btn tt-btn--primary" (click)="create()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add supplier
            </button>
          </div>
        }
      </header>

      <div class="tt-panel">
        <tt-data-grid
          #grid
          gridKey="suppliers"
          [columns]="columns"
          [dataSource]="dataSource"
          [actions]="actions"
          [defaultSort]="[{ field: 'name', desc: false }]"
          searchPlaceholder="Search name, phone or address"
          emptyTitle="No suppliers yet"
          emptyText="Add the shops you buy stock from."
        />
      </div>
    </div>

    <tt-drawer
      [open]="drawerOpen()"
      [heading]="editingId() ? 'Edit supplier' : 'Add supplier'"
      (closed)="close()"
    >
      <form class="tt-form" (ngSubmit)="save()" id="supplier-form">
        <div class="tt-field">
          <label class="tt-field__label" for="name">Supplier name</label>
          <input id="name" class="tt-input" name="name" required
                 [class.tt-input--invalid]="error()"
                 [ngModel]="form().name" (ngModelChange)="patch('name', $event)" />
          @if (error()) {
            <p class="tt-field__error">{{ error() }}</p>
          }
        </div>

        <div class="tt-field">
          <label class="tt-field__label" for="phone">Phone</label>
          <input id="phone" class="tt-input" name="phone" inputmode="tel"
                 [ngModel]="form().phone" (ngModelChange)="patch('phone', $event)" />
        </div>

        <div class="tt-field">
          <label class="tt-field__label" for="address">Address</label>
          <textarea id="address" class="tt-textarea" name="address"
                    [ngModel]="form().address" (ngModelChange)="patch('address', $event)"></textarea>
        </div>

        <label class="tt-checkbox">
          <input type="checkbox" name="isActive" [ngModel]="form().isActive"
                 (ngModelChange)="patch('isActive', $event)" />
          Available when recording a purchase
        </label>
      </form>

      <div drawerFooter>
        <button type="button" class="tt-btn tt-btn--ghost" (click)="close()">Cancel</button>
        <button type="submit" form="supplier-form" class="tt-btn tt-btn--primary" [disabled]="saving()">
          {{ saving() ? 'Saving' : editingId() ? 'Save changes' : 'Add supplier' }}
        </button>
      </div>
    </tt-drawer>
  `,
})
export class SupplierListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly canWrite = this.auth.canWrite('Suppliers');
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly form = signal<SaveSupplierRequest>({ ...BLANK });
  readonly error = signal('');

  readonly columns: GridColumn<Row>[] = [
    { field: 'name', header: 'Supplier', kind: 'text', flex: 2, minWidth: 190 },
    { field: 'phone', header: 'Phone', kind: 'text', width: 140 },
    { field: 'address', header: 'Address', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'payable', header: 'Payable', kind: 'money', width: 130 },
    {
      field: 'isActive',
      header: 'Status',
      kind: 'bool',
      width: 100,
      html: true,
      render: (row) =>
        row.isActive
          ? '<span class="tt-chip tt-chip--success">Active</span>'
          : '<span class="tt-chip tt-chip--neutral">Inactive</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = [
    {
      label: 'Open ledger',
      icon: 'M4 4h16v16H4V4Zm4 12V9m4 7v-4m4 4v-8',
      run: (row) => void this.router.navigate(['/suppliers', row.id, 'ledger']),
    },
    ...(this.canWrite
      ? [
          {
            label: 'Edit supplier',
            icon: 'M4 20h4l10-10-4-4L4 16v4Z',
            run: (row: Row) => this.edit(row),
          },
          {
            label: 'Remove supplier',
            icon: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
            kind: 'danger' as const,
            run: (row: Row) => void this.remove(row),
          },
        ]
      : []),
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('suppliers', request),
    export: (request: QueryRequest) => this.api.export('suppliers', request),
  };

  create(): void {
    this.editingId.set(null);
    this.error.set('');
    this.form.set({ ...BLANK });
    this.drawerOpen.set(true);
  }

  edit(row: SupplierDto): void {
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

  patch<K extends keyof SaveSupplierRequest>(key: K, value: SaveSupplierRequest[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  save(): void {
    const body = this.form();

    if (!body.name.trim()) {
      this.error.set('A supplier name is required.');
      return;
    }

    this.error.set('');
    this.saving.set(true);

    const id = this.editingId();
    const request = id
      ? this.api.put<SupplierDto>(`suppliers/${id}`, body)
      : this.api.post<SupplierDto>('suppliers', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(id ? 'Supplier updated' : 'Supplier added', saved.name);
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  private async remove(row: SupplierDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: `Remove ${row.name}?`,
      message:
        'A supplier with purchase history is made inactive instead of deleted, so past bills still make sense.',
      confirmLabel: 'Remove supplier',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`suppliers/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Supplier removed', row.name);
        this.grid()?.refresh();
      },
    });
  }
}
