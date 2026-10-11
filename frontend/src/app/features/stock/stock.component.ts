import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  PosProductDto,
  ProductDto,
  QueryRequest,
  StockLevelDto,
  StockMovementDto,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';

type LevelRow = StockLevelDto & Record<string, unknown>;
type MovementRow = StockMovementDto & Record<string, unknown>;

const MOVEMENT_TONE: Record<string, string> = {
  Opening: 'neutral',
  Purchase: 'success',
  Sale: 'info',
  AdjustmentIn: 'success',
  AdjustmentOut: 'warning',
  TransferIn: 'success',
  TransferOut: 'warning',
  SaleVoid: 'unpaid',
};

@Component({
  selector: 'tt-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './stock.component.html',
})
export class StockComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly levelGrid = viewChild<DataGridComponent<LevelRow>>('levelGrid');
  private readonly movementGrid = viewChild<DataGridComponent<MovementRow>>('movementGrid');

  readonly canWrite = this.auth.canWrite('Stock');
  readonly shops = this.auth.shops;
  readonly activeShopId = this.auth.activeShopId;
  readonly tab = signal<'levels' | 'movements'>('levels');

  // Adjust
  readonly adjustOpen = signal(false);
  readonly adjustSaving = signal(false);
  readonly adjustError = signal('');
  readonly adjustRow = signal<StockLevelDto | null>(null);
  readonly adjustDirection = signal<'in' | 'out'>('in');
  readonly adjustQty = signal(1);
  readonly adjustReason = signal('');

  // Transfer
  readonly transferOpen = signal(false);
  readonly transferSaving = signal(false);
  readonly transferError = signal('');
  readonly transferProduct = signal<PosProductDto | ProductDto | null>(null);
  readonly transferFrom = signal<number | null>(null);
  readonly transferTo = signal<number | null>(null);
  readonly transferQty = signal(1);
  readonly transferNote = signal('');
  readonly transferSearch = signal('');
  readonly transferResults = signal<PosProductDto[]>([]);

  readonly adjustPreview = computed(() => {
    const row = this.adjustRow();
    if (!row) {
      return null;
    }

    const delta = this.adjustDirection() === 'in' ? this.adjustQty() : -this.adjustQty();
    return { from: row.qty, to: row.qty + delta, delta };
  });

  readonly transferTargets = computed(() =>
    this.shops().filter((shop) => shop.id !== this.transferFrom()),
  );

  readonly levelColumns: GridColumn<LevelRow>[] = [
    { field: 'sku', header: 'SKU', kind: 'text', width: 140 },
    { field: 'productName', header: 'Product', kind: 'text', flex: 2, minWidth: 200 },
    { field: 'categoryName', header: 'Category', kind: 'text', width: 130 },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    {
      field: 'qty',
      header: 'On hand',
      kind: 'number',
      width: 105,
      html: true,
      render: (row) =>
        row.qty <= 0
          ? `<span class="tt-neg tt-num">${row.qty}</span>`
          : `<span class="tt-num">${row.qty}</span>`,
      cellClass: 'tt-cell-number',
    },
    { field: 'reorderLevel', header: 'Reorder at', kind: 'number', width: 115 },
    { field: 'costPrice', header: 'Cost', kind: 'money', width: 110, hidden: true },
    { field: 'stockValue', header: 'Stock value', kind: 'money', width: 130 },
    {
      field: 'isLow',
      header: 'Flag',
      kind: 'bool',
      width: 110,
      html: true,
      render: (row) =>
        row.isLow ? '<span class="tt-chip tt-chip--warning">Low</span>' : '<span class="tt-muted">Fine</span>',
    },
  ];

  readonly movementColumns: GridColumn<MovementRow>[] = [
    { field: 'movedAt', header: 'When', kind: 'date', width: 130 },
    { field: 'sku', header: 'SKU', kind: 'text', width: 140 },
    { field: 'productName', header: 'Product', kind: 'text', flex: 2, minWidth: 190 },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    {
      field: 'type',
      header: 'Type',
      kind: 'enum',
      width: 140,
      options: [
        'Opening',
        'Purchase',
        'Sale',
        'AdjustmentIn',
        'AdjustmentOut',
        'TransferIn',
        'TransferOut',
        'SaleVoid',
      ],
      html: true,
      render: (row) =>
        `<span class="tt-chip tt-chip--${MOVEMENT_TONE[row.type] ?? 'neutral'}">${row.type}</span>`,
    },
    {
      field: 'qty',
      header: 'Change',
      kind: 'number',
      width: 100,
      html: true,
      render: (row) =>
        row.qty < 0
          ? `<span class="tt-neg tt-num">${row.qty}</span>`
          : `<span class="tt-pos tt-num">+${row.qty}</span>`,
      cellClass: 'tt-cell-number',
    },
    { field: 'reference', header: 'Reference', kind: 'text', width: 165 },
    { field: 'reason', header: 'Reason', kind: 'text', flex: 2, minWidth: 160 },
    { field: 'createdBy', header: 'By', kind: 'text', width: 120, hidden: true },
  ];

  readonly levelActions: GridAction<LevelRow>[] = this.canWrite
    ? [
        {
          label: 'Adjust stock',
          icon: 'M12 5v14M5 12h14',
          run: (row) => this.openAdjust(row),
        },
      ]
    : [];

  readonly levelSource: GridDataSource<LevelRow> = {
    query: (request: QueryRequest) => this.api.query<LevelRow>('stock', request),
    export: (request: QueryRequest) => this.api.export('stock', request),
  };

  readonly movementSource: GridDataSource<MovementRow> = {
    query: (request: QueryRequest) => this.api.query<MovementRow>('stock/movements', request),
    export: (request: QueryRequest) => this.api.export('stock/movements', request),
  };

  setTab(tab: 'levels' | 'movements'): void {
    this.tab.set(tab);
  }

  // ---------- Adjust ----------

  openAdjust(row: StockLevelDto): void {
    this.adjustRow.set(row);
    this.adjustDirection.set('in');
    this.adjustQty.set(1);
    this.adjustReason.set('');
    this.adjustError.set('');
    this.adjustOpen.set(true);
  }

  closeAdjust(): void {
    this.adjustOpen.set(false);
  }

  saveAdjust(): void {
    const row = this.adjustRow();
    if (!row) {
      return;
    }

    if (this.adjustQty() <= 0) {
      this.adjustError.set('Enter a quantity above zero.');
      return;
    }

    if (this.adjustReason().trim().length < 3) {
      this.adjustError.set('Give a reason. It is kept with the movement.');
      return;
    }

    const signed = this.adjustDirection() === 'in' ? this.adjustQty() : -this.adjustQty();

    if (row.qty + signed < 0) {
      this.adjustError.set(`Only ${row.qty} on hand, so that would go negative.`);
      return;
    }

    this.adjustError.set('');
    this.adjustSaving.set(true);

    this.api
      .post('stock/adjust', {
        shopId: row.shopId,
        productId: row.productId,
        qty: signed,
        reason: this.adjustReason().trim(),
      })
      .subscribe({
        next: () => {
          this.adjustSaving.set(false);
          this.adjustOpen.set(false);
          this.alerts.success('Stock adjusted', `${row.sku} by ${signed > 0 ? '+' : ''}${signed}`);
          this.levelGrid()?.refresh();
          this.movementGrid()?.refresh();
        },
        error: () => this.adjustSaving.set(false),
      });
  }

  // ---------- Transfer ----------

  openTransfer(): void {
    this.transferProduct.set(null);
    this.transferFrom.set(this.activeShopId() ?? this.shops()[0]?.id ?? null);
    this.transferTo.set(null);
    this.transferQty.set(1);
    this.transferNote.set('');
    this.transferSearch.set('');
    this.transferResults.set([]);
    this.transferError.set('');
    this.transferOpen.set(true);
  }

  closeTransfer(): void {
    this.transferOpen.set(false);
  }

  searchTransferProduct(term: string): void {
    this.transferSearch.set(term);
    const shopId = this.transferFrom();

    if (shopId === null || term.trim().length < 2) {
      this.transferResults.set([]);
      return;
    }

    this.api
      .get<PosProductDto[]>('products/pos-search', { shopId, term, take: 12 })
      .subscribe({
        next: (rows) => this.transferResults.set(rows.filter((row) => row.qty > 0)),
        error: () => this.transferResults.set([]),
      });
  }

  pickTransferProduct(product: PosProductDto): void {
    this.transferProduct.set(product);
    this.transferResults.set([]);
    this.transferSearch.set(`${product.name} (${product.qty} on hand)`);
  }

  saveTransfer(): void {
    const product = this.transferProduct();
    const from = this.transferFrom();
    const to = this.transferTo();

    if (!product) {
      this.transferError.set('Pick the product to move.');
      return;
    }

    if (from === null || to === null) {
      this.transferError.set('Choose both shops.');
      return;
    }

    if (from === to) {
      this.transferError.set('Pick two different shops.');
      return;
    }

    if (this.transferQty() <= 0) {
      this.transferError.set('Enter a quantity above zero.');
      return;
    }

    this.transferError.set('');
    this.transferSaving.set(true);

    this.api
      .post('stock/transfer', {
        fromShopId: from,
        toShopId: to,
        productId: product.id,
        qty: this.transferQty(),
        note: this.transferNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.transferSaving.set(false);
          this.transferOpen.set(false);
          this.alerts.success('Stock transferred', `${this.transferQty()} x ${product.name}`);
          this.levelGrid()?.refresh();
          this.movementGrid()?.refresh();
        },
        error: () => this.transferSaving.set(false),
      });
  }
}
