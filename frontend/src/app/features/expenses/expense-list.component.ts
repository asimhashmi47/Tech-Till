import { CommonModule } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ExpenseCategoryDto,
  ExpenseDto,
  PaymentMethod,
  QueryRequest,
  SaveExpenseRequest,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { formatMoney } from '../../core/services/currency';

type Row = ExpenseDto & Record<string, unknown>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'tt-expense-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './expense-list.component.html',
})
export class ExpenseListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly canWrite = this.auth.canWrite('Expenses');
  readonly shops = this.auth.shops;
  readonly activeShopId = this.auth.activeShopId;

  readonly categories = signal<ExpenseCategoryDto[]>([]);
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly errors = signal<Record<string, string>>({});

  readonly shopId = signal<number | null>(null);
  readonly categoryId = signal(0);
  readonly date = signal(today());
  readonly amount = signal(0);
  readonly method = signal<PaymentMethod>('Cash');
  readonly note = signal('');

  // Adding a category without leaving the expense form.
  readonly newCategory = signal('');
  readonly addingCategory = signal(false);

  readonly columns: GridColumn<Row>[] = [
    { field: 'expenseDate', header: 'Date', kind: 'date', width: 130 },
    { field: 'categoryName', header: 'Category', kind: 'text', width: 150 },
    { field: 'amount', header: 'Amount', kind: 'money', width: 125 },
    {
      field: 'method',
      header: 'Method',
      kind: 'enum',
      width: 105,
      options: ['Cash', 'Card', 'Bank'],
    },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    { field: 'note', header: 'Note', kind: 'text', flex: 2, minWidth: 180 },
    { field: 'createdBy', header: 'Entered by', kind: 'text', width: 125, hidden: true },
  ];

  readonly actions: GridAction<Row>[] = this.canWrite
    ? [
        { label: 'Edit expense', icon: 'M4 20h4l10-10-4-4L4 16v4Z', run: (row) => this.edit(row) },
        {
          label: 'Remove expense',
          icon: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
          kind: 'danger',
          run: (row) => void this.remove(row),
        },
      ]
    : [];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('expenses', request),
    export: (request: QueryRequest) => this.api.export('expenses', request),
  };

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.api.get<ExpenseCategoryDto[]>('expenses/categories').subscribe({
      next: (rows) => this.categories.set(rows),
      error: () => this.categories.set([]),
    });
  }

  create(): void {
    this.editingId.set(null);
    this.errors.set({});
    this.shopId.set(this.activeShopId() ?? this.shops()[0]?.id ?? null);
    this.categoryId.set(this.categories()[0]?.id ?? 0);
    this.date.set(today());
    this.amount.set(0);
    this.method.set('Cash');
    this.note.set('');
    this.drawerOpen.set(true);
  }

  edit(row: ExpenseDto): void {
    this.editingId.set(row.id);
    this.errors.set({});
    this.shopId.set(row.shopId);
    this.categoryId.set(row.expenseCategoryId);
    this.date.set(row.expenseDate.slice(0, 10));
    this.amount.set(row.amount);
    this.method.set(row.method);
    this.note.set(row.note ?? '');
    this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  addCategory(): void {
    const name = this.newCategory().trim();
    if (!name) {
      return;
    }

    this.addingCategory.set(true);
    this.api
      .post<ExpenseCategoryDto>('expenses/categories', { name, isActive: true })
      .subscribe({
        next: (created) => {
          this.addingCategory.set(false);
          this.newCategory.set('');
          this.categories.update((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name)));
          this.categoryId.set(created.id);
          this.alerts.success('Category added', created.name);
        },
        error: () => this.addingCategory.set(false),
      });
  }

  save(): void {
    const found: Record<string, string> = {};
    const shopId = this.shopId();

    if (shopId === null) {
      found['shopId'] = 'Choose the shop this expense belongs to.';
    }

    if (!this.categoryId()) {
      found['categoryId'] = 'Choose a category.';
    }

    if (this.amount() <= 0) {
      found['amount'] = 'Enter an amount above zero.';
    }

    this.errors.set(found);
    if (Object.keys(found).length > 0 || shopId === null) {
      return;
    }

    const body: SaveExpenseRequest = {
      shopId,
      expenseCategoryId: this.categoryId(),
      expenseDate: new Date(this.date()).toISOString(),
      amount: this.amount(),
      method: this.method(),
      note: this.note().trim() || null,
    };

    this.saving.set(true);
    const id = this.editingId();
    const request = id
      ? this.api.put<ExpenseDto>(`expenses/${id}`, body)
      : this.api.post<ExpenseDto>('expenses', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(id ? 'Expense updated' : 'Expense recorded', this.money(saved.amount));
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  money(value: number): string {
    return formatMoney(value);
  }

  private async remove(row: ExpenseDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: `Remove this ${this.money(row.amount)} expense?`,
      message:
        row.method === 'Cash'
          ? 'The matching cash out entry is removed from the drawer as well.'
          : 'Profit for that date changes once this is removed.',
      confirmLabel: 'Remove expense',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`expenses/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Expense removed');
        this.grid()?.refresh();
      },
    });
  }
}
