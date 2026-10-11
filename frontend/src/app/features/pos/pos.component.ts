import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  CustomerDto,
  InvoiceDetailDto,
  PaymentMethod,
  PosProductDto,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatMoney } from '../../core/services/currency';

interface CartLine {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  qty: number;
  available: number;
}

/**
 * The till. Two panels: search and product tiles on the left, the cart and payment on
 * the right. F2 jumps to search and F9 takes payment, so a busy counter never needs the
 * mouse. Stock is checked here for a fast answer and again by the API before it commits.
 */
@Component({
  selector: 'tt-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  readonly term = signal('');
  readonly results = signal<PosProductDto[]>([]);
  readonly searching = signal(false);
  readonly categories = signal<string[]>([]);
  readonly activeCategory = signal<string | null>(null);

  readonly customers = signal<CustomerDto[]>([]);
  readonly customerId = signal<number>(0);
  readonly cart = signal<CartLine[]>([]);
  readonly discount = signal(0);
  readonly method = signal<PaymentMethod>('Cash');
  readonly paidNow = signal(0);
  readonly note = signal('');
  readonly submitting = signal(false);

  private searchTimer?: ReturnType<typeof setTimeout>;

  /** The till always sells from one shop, so a shop must be picked first. */
  readonly shopId = computed(() => this.auth.activeShopId());
  readonly shops = this.auth.shops;
  readonly needsShop = computed(() => this.shopId() === null);

  readonly subTotal = computed(() =>
    this.cart().reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
  );

  readonly total = computed(() => Math.max(0, this.subTotal() - this.discount()));

  readonly selectedCustomer = computed(() =>
    this.customers().find((c) => c.id === this.customerId()) ?? null,
  );

  readonly isWalkIn = computed(() => this.selectedCustomer()?.isWalkIn ?? false);

  readonly change = computed(() => Math.max(0, this.paidNow() - this.total()));
  readonly dueAfterPayment = computed(() => Math.max(0, this.total() - this.paidNow()));

  readonly visibleResults = computed(() => {
    const category = this.activeCategory();
    const rows = this.results();
    return category ? rows.filter((row) => row.categoryName === category) : rows;
  });

  readonly canCheckout = computed(() => {
    if (this.cart().length === 0 || this.needsShop() || this.submitting()) {
      return false;
    }

    if (this.discount() > this.subTotal()) {
      return false;
    }

    if (this.paidNow() > this.total()) {
      return false;
    }

    // A walk-in has no account to carry a balance, so the sale must be settled in full.
    return !(this.isWalkIn() && this.paidNow() < this.total());
  });

  readonly blocker = computed(() => {
    if (this.needsShop()) {
      return 'Pick one shop in the top bar before selling.';
    }

    if (this.cart().length === 0) {
      return 'Add a product to the cart.';
    }

    if (this.discount() > this.subTotal()) {
      return 'The discount is larger than the cart.';
    }

    if (this.paidNow() > this.total()) {
      return 'Amount received is more than the total.';
    }

    if (this.isWalkIn() && this.paidNow() < this.total()) {
      return 'A walk-in sale must be paid in full. Pick a named customer to sell on credit.';
    }

    return null;
  });

  constructor() {
    effect(() => {
      // Changing shop invalidates the cart, because stock differs per shop.
      const shopId = this.auth.activeShopId();
      this.cart.set([]);
      this.results.set([]);

      if (shopId !== null) {
        this.search('');
      }
    });
  }

  ngOnInit(): void {
    this.api.get<CustomerDto[]>('customers/lookup').subscribe({
      next: (rows) => {
        this.customers.set(rows);
        this.customerId.set(rows.find((r) => r.isWalkIn)?.id ?? rows[0]?.id ?? 0);
      },
      error: () => this.customers.set([]),
    });
  }

  onTermChange(value: string): void {
    this.term.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(value), 220);
  }

  search(term: string): void {
    const shopId = this.shopId();
    if (shopId === null) {
      return;
    }

    this.searching.set(true);
    this.api
      .get<PosProductDto[]>('products/pos-search', { shopId, term, take: 48 })
      .subscribe({
        next: (rows) => {
          this.results.set(rows);
          this.searching.set(false);

          const names = [...new Set(rows.map((r) => r.categoryName))].sort();
          this.categories.set(names);

          if (this.activeCategory() && !names.includes(this.activeCategory()!)) {
            this.activeCategory.set(null);
          }
        },
        error: () => {
          this.searching.set(false);
          this.results.set([]);
        },
      });
  }

  pickCategory(name: string | null): void {
    this.activeCategory.set(name);
  }

  /** Enter in the search box adds the only match, which makes a barcode scan one action. */
  onSearchEnter(): void {
    const rows = this.visibleResults();
    if (rows.length === 1) {
      this.add(rows[0]);
      this.term.set('');
      this.search('');
    }
  }

  add(product: PosProductDto): void {
    if (product.qty <= 0) {
      this.alerts.warning('Out of stock', `${product.name} has nothing left in this shop.`);
      return;
    }

    const existing = this.cart().find((line) => line.productId === product.id);

    if (existing) {
      if (existing.qty + 1 > product.qty) {
        this.alerts.warning('Not enough stock', `Only ${product.qty} of ${product.name} on hand.`);
        return;
      }

      this.setQty(product.id, existing.qty + 1);
      return;
    }

    this.cart.update((lines) => [
      ...lines,
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPrice: product.salePrice,
        qty: 1,
        available: product.qty,
      },
    ]);
  }

  setQty(productId: number, qty: number): void {
    this.cart.update((lines) =>
      lines.map((line) => {
        if (line.productId !== productId) {
          return line;
        }

        const next = Math.max(1, Math.min(qty, line.available));
        return { ...line, qty: next };
      }),
    );
  }

  setPrice(productId: number, price: number): void {
    this.cart.update((lines) =>
      lines.map((line) =>
        line.productId === productId ? { ...line, unitPrice: Math.max(0, price) } : line,
      ),
    );
  }

  removeLine(productId: number): void {
    this.cart.update((lines) => lines.filter((line) => line.productId !== productId));
  }

  async clearCart(): Promise<void> {
    if (this.cart().length === 0) {
      return;
    }

    const confirmed = await this.alerts.confirm({
      title: 'Clear the cart?',
      message: 'Every line will be removed. The sale is not recorded.',
      confirmLabel: 'Clear cart',
      cancelLabel: 'Keep the cart',
    });

    if (confirmed) {
      this.cart.set([]);
      this.discount.set(0);
      this.paidNow.set(0);
      this.note.set('');
    }
  }

  /** Fills the received box with the exact total, the common case at a counter. */
  payExact(): void {
    this.paidNow.set(this.total());
  }

  onMethodChange(method: PaymentMethod): void {
    this.method.set(method);

    // Credit means nothing is handed over now, anything else is normally paid in full.
    this.paidNow.set(method === 'Credit' ? 0 : this.total());
  }

  checkout(): void {
    const shopId = this.shopId();
    if (!this.canCheckout() || shopId === null) {
      return;
    }

    this.submitting.set(true);

    this.api
      .post<InvoiceDetailDto>('pos/sale', {
        shopId,
        customerId: this.customerId(),
        discount: this.discount(),
        paidNow: this.paidNow(),
        paymentMethod: this.method(),
        note: this.note().trim() || null,
        items: this.cart().map((line) => ({
          productId: line.productId,
          qty: line.qty,
          unitPrice: line.unitPrice,
        })),
      })
      .subscribe({
        next: (invoice) => {
          this.submitting.set(false);
          this.alerts.success(`Sale ${invoice.invoiceNo} recorded`, `Total ${money(invoice.total)}`);

          this.cart.set([]);
          this.discount.set(0);
          this.paidNow.set(0);
          this.note.set('');
          this.search(this.term());

          void this.router.navigate(['/invoices', invoice.id]);
        },
        error: () => this.submitting.set(false),
      });
  }

  money(value: number): string {
    return money(value);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.searchBox()?.nativeElement.focus();
      this.searchBox()?.nativeElement.select();
      return;
    }

    if (event.key === 'F9') {
      event.preventDefault();
      this.checkout();
    }
  }
}

function money(value: number): string {
  return formatMoney(value);
}
