import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  PaymentMethod,
  PurchaseBillDetailDto,
  PurchaseBillListDto,
  QueryRequest,
  SupplierDto,
  SupplierPaymentDto,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { formatMoney } from '../../core/services/currency';

type Row = PurchaseBillListDto & Record<string, unknown>;
type PaymentRow = SupplierPaymentDto & Record<string, unknown>;

@Component({
  selector: 'tt-purchase-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DataGridComponent, DrawerComponent],
  templateUrl: './purchase-list.component.html',
})
export class PurchaseListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly billGrid = viewChild<DataGridComponent<Row>>('billGrid');
  private readonly paymentGrid = viewChild<DataGridComponent<PaymentRow>>('paymentGrid');

  readonly canWrite = this.auth.canWrite('Purchases');
  readonly tab = signal<'bills' | 'payments'>('bills');

  // Bill detail drawer
  readonly detail = signal<PurchaseBillDetailDto | null>(null);
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);

  // Payment drawer
  readonly payOpen = signal(false);
  readonly paySaving = signal(false);
  readonly payError = signal('');
  readonly suppliers = signal<SupplierDto[]>([]);
  readonly paySupplierId = signal(0);
  readonly payBillId = signal<number | null>(null);
  readonly payAmount = signal(0);
  readonly payMethod = signal<PaymentMethod>('Bank');
  readonly payNote = signal('');
  readonly payShopId = signal<number | null>(null);

  readonly shops = this.auth.shops;
  readonly activeShopId = this.auth.activeShopId;

  readonly payBillLabel = computed(() => {
    const bill = this.detail();
    return bill ? `${bill.billNo}, ${this.money(bill.outstanding)} outstanding` : '';
  });

  readonly billColumns: GridColumn<Row>[] = [
    { field: 'billNo', header: 'Bill', kind: 'text', width: 170 },
    { field: 'billDate', header: 'Date', kind: 'date', width: 130 },
    { field: 'supplierName', header: 'Supplier', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150, hidden: true },
    { field: 'itemCount', header: 'Lines', kind: 'number', width: 80 },
    { field: 'total', header: 'Total', kind: 'money', width: 125 },
    { field: 'paidAmount', header: 'Paid', kind: 'money', width: 115 },
    { field: 'outstanding', header: 'Outstanding', kind: 'money', width: 130 },
    { field: 'createdBy', header: 'Entered by', kind: 'text', width: 125, hidden: true },
  ];

  readonly paymentColumns: GridColumn<PaymentRow>[] = [
    { field: 'paidAt', header: 'Date', kind: 'date', width: 130 },
    { field: 'supplierName', header: 'Supplier', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'billNo', header: 'Against bill', kind: 'text', width: 170 },
    { field: 'amount', header: 'Amount', kind: 'money', width: 125 },
    {
      field: 'method',
      header: 'Method',
      kind: 'enum',
      width: 105,
      options: ['Cash', 'Card', 'Bank', 'Credit'],
    },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    { field: 'note', header: 'Note', kind: 'text', flex: 2, minWidth: 150, hidden: true },
    { field: 'createdBy', header: 'Recorded by', kind: 'text', width: 130, hidden: true },
  ];

  readonly billActions: GridAction<Row>[] = [
    {
      label: 'Open bill',
      icon: 'M7 17 17 7M9 7h8v8',
      run: (row) => this.openDetail(row.id),
    },
  ];

  readonly billSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('purchases', request),
    export: (request: QueryRequest) => this.api.export('purchases', request),
  };

  readonly paymentSource: GridDataSource<PaymentRow> = {
    query: (request: QueryRequest) => this.api.query<PaymentRow>('purchases/payments', request),
    export: (request: QueryRequest) => this.api.export('purchases/payments', request),
  };

  ngOnInit(): void {
    if (this.canWrite) {
      this.api.get<SupplierDto[]>('suppliers/lookup').subscribe({
        next: (rows) => this.suppliers.set(rows),
        error: () => this.suppliers.set([]),
      });
    }
  }

  setTab(tab: 'bills' | 'payments'): void {
    this.tab.set(tab);
  }

  openDetail(id: number): void {
    this.detailLoading.set(true);
    this.detailOpen.set(true);

    this.api.get<PurchaseBillDetailDto>(`purchases/${id}`).subscribe({
      next: (bill) => {
        this.detail.set(bill);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
        this.detailOpen.set(false);
      },
    });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  /** Opens the payment drawer against the bill currently on screen. */
  payThisBill(): void {
    const bill = this.detail();
    if (!bill) {
      return;
    }

    this.paySupplierId.set(bill.supplierId);
    this.payBillId.set(bill.id);
    this.payShopId.set(bill.shopId);
    this.payAmount.set(bill.outstanding);
    this.payMethod.set('Bank');
    this.payNote.set('');
    this.payError.set('');
    this.detailOpen.set(false);
    this.payOpen.set(true);
  }

  openPayment(): void {
    this.paySupplierId.set(this.suppliers()[0]?.id ?? 0);
    this.payBillId.set(null);
    this.payShopId.set(this.activeShopId() ?? this.shops()[0]?.id ?? null);
    this.payAmount.set(0);
    this.payMethod.set('Bank');
    this.payNote.set('');
    this.payError.set('');
    this.payOpen.set(true);
  }

  closePayment(): void {
    this.payOpen.set(false);
  }

  savePayment(): void {
    const shopId = this.payShopId();

    if (shopId === null) {
      this.payError.set('Choose the shop the money came from.');
      return;
    }

    if (!this.paySupplierId()) {
      this.payError.set('Choose a supplier.');
      return;
    }

    if (this.payAmount() <= 0) {
      this.payError.set('Enter an amount above zero.');
      return;
    }

    this.payError.set('');
    this.paySaving.set(true);

    this.api
      .post('purchases/payments', {
        shopId,
        supplierId: this.paySupplierId(),
        purchaseBillId: this.payBillId(),
        paidAt: new Date().toISOString(),
        amount: this.payAmount(),
        method: this.payMethod(),
        note: this.payNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.paySaving.set(false);
          this.payOpen.set(false);
          this.alerts.success('Payment recorded', this.money(this.payAmount()));
          this.billGrid()?.refresh();
          this.paymentGrid()?.refresh();
        },
        error: () => this.paySaving.set(false),
      });
  }

  money(value: number): string {
    return formatMoney(value);
  }

  date(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
