import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  PaymentMethod,
  PosProductDto,
  PurchaseBillDetailDto,
  SupplierDto,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatMoney } from '../../core/services/currency';

interface BillLine {
  productId: number;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

/**
 * Receiving a purchase bill. Stock goes up, the latest unit cost becomes the product cost
 * used for future COGS, and anything unpaid becomes a supplier payable.
 */
@Component({
  selector: 'tt-purchase-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './purchase-form.component.html',
  styleUrl: './purchase-form.component.scss',
})
export class PurchaseFormComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly shops = this.auth.shops;
  readonly suppliers = signal<SupplierDto[]>([]);

  readonly shopId = signal<number | null>(this.auth.activeShopId() ?? this.auth.shops()[0]?.id ?? null);
  readonly supplierId = signal(0);
  readonly billDate = signal(new Date().toISOString().slice(0, 10));
  readonly method = signal<PaymentMethod>('Bank');
  readonly paidNow = signal(0);
  readonly note = signal('');
  readonly lines = signal<BillLine[]>([]);
  readonly submitting = signal(false);
  readonly error = signal('');

  readonly search = signal('');
  readonly results = signal<PosProductDto[]>([]);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + line.qty * line.unitCost, 0),
  );

  readonly outstanding = computed(() => Math.max(0, this.total() - this.paidNow()));

  readonly canSave = computed(
    () =>
      this.lines().length > 0 &&
      this.shopId() !== null &&
      this.supplierId() > 0 &&
      this.paidNow() <= this.total() &&
      this.paidNow() >= 0 &&
      !this.submitting(),
  );

  ngOnInit(): void {
    this.api.get<SupplierDto[]>('suppliers/lookup').subscribe({
      next: (rows) => {
        this.suppliers.set(rows);
        this.supplierId.set(rows[0]?.id ?? 0);
      },
      error: () => this.suppliers.set([]),
    });
  }

  onSearch(term: string): void {
    this.search.set(term);
    clearTimeout(this.searchTimer);

    if (term.trim().length < 2) {
      this.results.set([]);
      return;
    }

    const shopId = this.shopId();
    if (shopId === null) {
      return;
    }

    this.searchTimer = setTimeout(() => {
      this.api
        .get<PosProductDto[]>('products/pos-search', { shopId, term, take: 12 })
        .subscribe({
          next: (rows) => this.results.set(rows),
          error: () => this.results.set([]),
        });
    }, 220);
  }

  addProduct(product: PosProductDto): void {
    this.results.set([]);
    this.search.set('');

    const existing = this.lines().find((line) => line.productId === product.id);
    if (existing) {
      this.setQty(product.id, existing.qty + 1);
      return;
    }

    this.lines.update((lines) => [
      ...lines,
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,

        // Cost is what the supplier charges, so it starts blank rather than at the
        // selling price. The operator types the figure from the bill.
        qty: 1,
        unitCost: 0,
      },
    ]);
  }

  setQty(productId: number, qty: number): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.productId === productId ? { ...line, qty: Math.max(1, Math.floor(qty)) } : line,
      ),
    );
  }

  setCost(productId: number, cost: number): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.productId === productId ? { ...line, unitCost: Math.max(0, cost) } : line,
      ),
    );
  }

  removeLine(productId: number): void {
    this.lines.update((lines) => lines.filter((line) => line.productId !== productId));
  }

  payFull(): void {
    this.paidNow.set(this.total());
  }

  save(): void {
    const shopId = this.shopId();

    if (!this.canSave() || shopId === null) {
      if (this.lines().length === 0) {
        this.error.set('Add at least one product.');
      } else if (!this.supplierId()) {
        this.error.set('Choose the supplier.');
      }

      return;
    }

    if (this.lines().some((line) => line.unitCost <= 0)) {
      this.error.set('Every line needs a unit cost from the bill.');
      return;
    }

    this.error.set('');
    this.submitting.set(true);

    this.api
      .post<PurchaseBillDetailDto>('purchases', {
        shopId,
        supplierId: this.supplierId(),
        billDate: new Date(this.billDate()).toISOString(),
        paidNow: this.paidNow(),
        paymentMethod: this.method(),
        note: this.note().trim() || null,
        items: this.lines().map((line) => ({
          productId: line.productId,
          qty: line.qty,
          unitCost: line.unitCost,
        })),
      })
      .subscribe({
        next: (bill) => {
          this.submitting.set(false);
          this.alerts.success(`Bill ${bill.billNo} recorded`, `Stock updated, ${this.money(bill.outstanding)} payable`);
          void this.router.navigate(['/purchases']);
        },
        error: () => this.submitting.set(false),
      });
  }

  async cancel(): Promise<void> {
    if (this.lines().length === 0) {
      void this.router.navigate(['/purchases']);
      return;
    }

    const confirmed = await this.alerts.confirm({
      title: 'Discard this bill?',
      message: 'Nothing has been saved yet, and the lines will be lost.',
      confirmLabel: 'Discard bill',
      cancelLabel: 'Keep editing',
    });

    if (confirmed) {
      void this.router.navigate(['/purchases']);
    }
  }

  money(value: number): string {
    return formatMoney(value);
  }
}
