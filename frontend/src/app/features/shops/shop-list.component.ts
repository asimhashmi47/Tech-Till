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

type Row = ShopDto & Record<string, unknown>;

const BLANK: SaveShopRequest = { code: '', name: '', address: '', phone: '', isActive: true };

@Component({
  selector: 'tt-shop-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  template: `
    <div class="tt-page">
      <header class="tt-page-head">
        <div class="tt-page-head__text">
          <h1 class="tt-page-head__title">Shops</h1>
          <p class="tt-page-head__sub">
            The shop code prefixes every invoice and bill number, so it is fixed once trading starts.
          </p>
        </div>

        @if (canWrite) {
          <div class="tt-page-head__actions">
            <button type="button" class="tt-btn tt-btn--primary" (click)="create()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add shop
            </button>
          </div>
        }
      </header>

      <div class="tt-panel">
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
    </div>

    <tt-drawer
      [open]="drawerOpen()"
      [heading]="editingId() ? 'Edit shop' : 'Add shop'"
      (closed)="close()"
    >
      <form class="tt-form" (ngSubmit)="save()" id="shop-form">
        <div class="tt-field">
          <label class="tt-field__label" for="code">Shop code</label>
          <input id="code" class="tt-input" name="code" required maxlength="16"
                 [class.tt-input--invalid]="errors()['code']"
                 [ngModel]="form().code" (ngModelChange)="patch('code', $event)" />
          <p class="tt-field__hint">
            Short and uppercase, for example MAIN. Used as MAIN-202610-0001 on invoices.
          </p>
          @if (errors()['code']) {
            <p class="tt-field__error">{{ errors()['code'] }}</p>
          }
        </div>

        <div class="tt-field">
          <label class="tt-field__label" for="name">Shop name</label>
          <input id="name" class="tt-input" name="name" required
                 [class.tt-input--invalid]="errors()['name']"
                 [ngModel]="form().name" (ngModelChange)="patch('name', $event)" />
          @if (errors()['name']) {
            <p class="tt-field__error">{{ errors()['name'] }}</p>
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
          <p class="tt-field__hint">Printed on the invoice header.</p>
        </div>

        <label class="tt-checkbox">
          <input type="checkbox" name="isActive" [ngModel]="form().isActive"
                 (ngModelChange)="patch('isActive', $event)" />
          Trading
        </label>
      </form>

      <div drawerFooter>
        <button type="button" class="tt-btn tt-btn--ghost" (click)="close()">Cancel</button>
        <button type="submit" form="shop-form" class="tt-btn tt-btn--primary" [disabled]="saving()">
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
          ? '<span class="tt-chip tt-chip--success">Trading</span>'
          : '<span class="tt-chip tt-chip--neutral">Closed</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = this.canWrite
    ? [{ label: 'Edit shop', icon: 'M4 20h4l10-10-4-4L4 16v4Z', run: (row) => this.edit(row) }]
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
