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
import { LucideAngularModule } from 'lucide-angular';
import { PageHeader } from '../../shared/ui/ui';

type Row = SupplierDto & Record<string, unknown>;

const BLANK: SaveSupplierRequest = { name: '', phone: '', address: '', isActive: true };

@Component({
  selector: 'tt-supplier-list',
  standalone: true,
  imports: [LucideAngularModule, PageHeader, CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  template: `
    <div class="page-stack">
      <app-page-header title="Suppliers" icon="truck" subtitle="Payable is what is still owed on bills for the shops you can see.">
        @if (canWrite) {
          <div class="contents">
            <button type="button" class="btn btn-primary" (click)="create()">
              <lucide-icon name="plus" [size]="15" />
              Add supplier
            </button>
          </div>
        }
      </app-page-header>

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

    <tt-drawer
      [open]="drawerOpen()"
      [heading]="editingId() ? 'Edit supplier' : 'Add supplier'"
      (closed)="close()"
    >
      <form class="grid gap-3.5" (ngSubmit)="save()" id="supplier-form">
        <div class="block min-w-0">
          <label class="label" for="name">Supplier name</label>
          <input id="name" class="input" name="name" required
                 [class.invalid]="error()"
                 [ngModel]="form().name" (ngModelChange)="patch('name', $event)" />
          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }
        </div>

        <div class="block min-w-0">
          <label class="label" for="phone">Phone</label>
          <input id="phone" class="input" name="phone" inputmode="tel"
                 [ngModel]="form().phone" (ngModelChange)="patch('phone', $event)" />
        </div>

        <div class="block min-w-0">
          <label class="label" for="address">Address</label>
          <textarea id="address" class="textarea" name="address"
                    [ngModel]="form().address" (ngModelChange)="patch('address', $event)"></textarea>
        </div>

        <label class="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="isActive" [ngModel]="form().isActive"
                 (ngModelChange)="patch('isActive', $event)" />
          Available when recording a purchase
        </label>
      </form>

      <div drawerFooter class="contents">
        <button type="button" class="btn btn-neutral" (click)="close()">Cancel</button>
        <button type="submit" form="supplier-form" class="btn btn-primary" [disabled]="saving()">
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
          ? '<span class="badge badge-dot tone-success">Active</span>'
          : '<span class="badge badge-dot tone-neutral">Inactive</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = [
    {
      label: 'Open ledger',
      icon: 'book-open',
      run: (row) => void this.router.navigate(['/suppliers', row.id, 'ledger']),
    },
    ...(this.canWrite
      ? [
          {
            label: 'Edit supplier',
            icon: 'pencil',
            run: (row: Row) => this.edit(row),
          },
          {
            label: 'Remove supplier',
            icon: 'trash-2',
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
