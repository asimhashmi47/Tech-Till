import { CommonModule } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { QueryRequest, SaveShopRequest, ShopDto } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeader } from '../../shared/ui/ui';

type Row = ShopDto & Record<string, unknown>;

const BLANK: SaveShopRequest = { code: '', name: '', address: '', phone: '', isActive: true };

@Component({
  selector: 'tt-shop-list',
  standalone: true,
  imports: [LucideAngularModule, PageHeader, CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  template: `
    <div class="page-stack">
      <app-page-header title="Shops" icon="store" subtitle="The shop code prefixes every invoice and bill number, so it is fixed once trading starts.">
        @if (canWrite) {
          <div class="contents">
            <button type="button" class="btn btn-primary" (click)="create()">
              <lucide-icon name="plus" [size]="15" />
              Add shop
            </button>
          </div>
        }
      </app-page-header>

      <tt-data-grid
          #grid
          gridKey="shops"
          [columns]="columns"
          [dataSource]="dataSource"
          [actions]="actions"
          [defaultSort]="[{ field: 'name', desc: false }]"
          searchPlaceholder="Search code, name or address"
          emptyTitle="No shops yet"
          emptyText="Add a shop before recording any stock or sales."
          [useShopScope]="false"
        />
    </div>

    <tt-drawer
      [open]="drawerOpen()"
      [heading]="editingId() ? 'Edit shop' : 'Add shop'"
      (closed)="close()"
    >
      <form class="grid gap-3.5" (ngSubmit)="save()" id="shop-form">
        <div class="block min-w-0">
          <label class="label" for="code">Shop code</label>
          <input id="code" class="input" name="code" required maxlength="16"
                 [class.invalid]="errors()['code']"
                 [ngModel]="form().code" (ngModelChange)="patch('code', $event)" />
          <p class="hint">
            Short and uppercase, for example MAIN. Used as MAIN-202610-0001 on invoices.
          </p>
          @if (errors()['code']) {
            <p class="error-text">{{ errors()['code'] }}</p>
          }
        </div>

        <div class="block min-w-0">
          <label class="label" for="name">Shop name</label>
          <input id="name" class="input" name="name" required
                 [class.invalid]="errors()['name']"
                 [ngModel]="form().name" (ngModelChange)="patch('name', $event)" />
          @if (errors()['name']) {
            <p class="error-text">{{ errors()['name'] }}</p>
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
          <p class="hint">Printed on the invoice header.</p>
        </div>

        <label class="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="isActive" [ngModel]="form().isActive"
                 (ngModelChange)="patch('isActive', $event)" />
          Trading
        </label>
      </form>

      <div drawerFooter class="contents">
        <button type="button" class="btn btn-neutral" (click)="close()">Cancel</button>
        <button type="submit" form="shop-form" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving' : editingId() ? 'Save changes' : 'Add shop' }}
        </button>
      </div>
    </tt-drawer>
  `,
})
export class ShopListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly canWrite = this.auth.canWrite('Shops');
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly form = signal<SaveShopRequest>({ ...BLANK });
  readonly errors = signal<Record<string, string>>({});

  readonly columns: GridColumn<Row>[] = [
    { field: 'code', header: 'Code', kind: 'text', width: 110 },
    { field: 'name', header: 'Shop', kind: 'text', flex: 2, minWidth: 190 },
    { field: 'address', header: 'Address', kind: 'text', flex: 2, minWidth: 190 },
    { field: 'phone', header: 'Phone', kind: 'text', width: 150 },
    {
      field: 'isActive',
      header: 'Status',
      kind: 'bool',
      width: 110,
      html: true,
      render: (row) =>
        row.isActive
          ? '<span class="badge badge-dot tone-success">Trading</span>'
          : '<span class="badge badge-dot tone-neutral">Closed</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = this.canWrite
    ? [{ label: 'Edit shop', icon: 'pencil', run: (row) => this.edit(row) }]
    : [];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('shops', request),
    export: (request: QueryRequest) => this.api.export('shops', request),
  };

  create(): void {
    this.editingId.set(null);
    this.errors.set({});
    this.form.set({ ...BLANK });
    this.drawerOpen.set(true);
  }

  edit(row: ShopDto): void {
    this.editingId.set(row.id);
    this.errors.set({});
    this.form.set({
      code: row.code,
      name: row.name,
      address: row.address ?? '',
      phone: row.phone ?? '',
      isActive: row.isActive,
    });
    this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  patch<K extends keyof SaveShopRequest>(key: K, value: SaveShopRequest[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  save(): void {
    const body = this.form();
    const found: Record<string, string> = {};

    if (!body.code.trim()) {
      found['code'] = 'A shop code is required.';
    }

    if (!body.name.trim()) {
      found['name'] = 'A shop name is required.';
    }

    this.errors.set(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    this.saving.set(true);
    const id = this.editingId();
    const request = id
      ? this.api.put<ShopDto>(`shops/${id}`, body)
      : this.api.post<ShopDto>('shops', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(id ? 'Shop updated' : 'Shop added', saved.name);
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }
}
