import { CommonModule } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CategoryDto,
  ProductDto,
  QueryRequest,
  SaveProductRequest,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';

const BLANK: SaveProductRequest = {
  sku: '',
  name: '',
  categoryId: 0,
  brand: '',
  costPrice: 0,
  salePrice: 0,
  reorderLevel: 0,
  isActive: true,
};

@Component({
  selector: 'tt-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './product-list.component.html',
})
export class ProductListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly grid = viewChild<DataGridComponent<ProductDto & Record<string, unknown>>>('grid');

  readonly canWrite = this.auth.canWrite('Products');
  readonly categories = signal<CategoryDto[]>([]);
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly form = signal<SaveProductRequest>({ ...BLANK });
  readonly errors = signal<Record<string, string>>({});

  readonly columns: GridColumn<ProductDto & Record<string, unknown>>[] = [
    { field: 'sku', header: 'SKU', kind: 'text', width: 140 },
    { field: 'name', header: 'Product', kind: 'text', flex: 2, minWidth: 200 },
    { field: 'categoryName', header: 'Category', kind: 'text', width: 130 },
    { field: 'brand', header: 'Brand', kind: 'text', width: 120 },
    { field: 'costPrice', header: 'Cost', kind: 'money', width: 110 },
    { field: 'salePrice', header: 'Price', kind: 'money', width: 110 },
    { field: 'totalStock', header: 'Stock', kind: 'number', width: 90 },
    { field: 'reorderLevel', header: 'Reorder at', kind: 'number', width: 110, hidden: true },
    {
      field: 'isActive',
      header: 'Status',
      kind: 'bool',
      width: 100,
      html: true,
      render: (row) =>
        row.isActive
          ? '<span class="tt-chip tt-chip--success">Active</span>'
          : '<span class="tt-chip tt-chip--neutral">Retired</span>',
    },
  ];

  readonly actions: GridAction<ProductDto & Record<string, unknown>>[] = this.canWrite
    ? [
        {
          label: 'Edit product',
          icon: 'M4 20h4l10-10-4-4L4 16v4Z',
          run: (row) => this.edit(row),
        },
        {
          label: 'Remove product',
          icon: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
          kind: 'danger',
          run: (row) => void this.remove(row),
        },
      ]
    : [];

  readonly dataSource: GridDataSource<ProductDto & Record<string, unknown>> = {
    query: (request: QueryRequest) =>
      this.api.query<ProductDto & Record<string, unknown>>('products', request),
    export: (request: QueryRequest) => this.api.export('products', request),
  };

  ngOnInit(): void {
    this.api.get<CategoryDto[]>('categories/lookup').subscribe({
      next: (rows) => this.categories.set(rows),
      error: () => this.categories.set([]),
    });
  }

  create(): void {
    this.editingId.set(null);
    this.errors.set({});
    this.form.set({ ...BLANK, categoryId: this.categories()[0]?.id ?? 0 });
    this.drawerOpen.set(true);
  }

  edit(row: ProductDto): void {
    this.editingId.set(row.id);
    this.errors.set({});
    this.form.set({
      sku: row.sku,
      name: row.name,
      categoryId: row.categoryId,
      brand: row.brand ?? '',
      costPrice: row.costPrice,
      salePrice: row.salePrice,
      reorderLevel: row.reorderLevel,
      isActive: row.isActive,
    });
    this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  patch<K extends keyof SaveProductRequest>(key: K, value: SaveProductRequest[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  save(): void {
    const body = this.form();
    const found: Record<string, string> = {};

    if (!body.sku.trim()) {
      found['sku'] = 'A SKU is required.';
    }

    if (!body.name.trim()) {
      found['name'] = 'A product name is required.';
    }

    if (!body.categoryId) {
      found['categoryId'] = 'Pick a category.';
    }

    if (body.salePrice < body.costPrice) {
      found['salePrice'] = 'The price is below cost. Change it or confirm the cost.';
    }

    this.errors.set(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    this.saving.set(true);
    const id = this.editingId();
    const request = id
      ? this.api.put<ProductDto>(`products/${id}`, body)
      : this.api.post<ProductDto>('products', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(id ? 'Product updated' : 'Product added', saved.name);
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  private async remove(row: ProductDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: `Remove ${row.name}?`,
      message:
        'A product that has already been bought or sold is retired instead of deleted, so its history stays intact.',
      confirmLabel: 'Remove product',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`products/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Product removed', row.sku);
        this.grid()?.refresh();
      },
    });
  }
}
