import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  PettyCashDayDto,
  PettyCashDirection,
  PettyCashEntryDto,
  QueryRequest,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { formatMoney } from '../../core/services/currency';

type Row = PettyCashEntryDto & Record<string, unknown>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'tt-petty-cash',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './petty-cash.component.html',
})
export class PettyCashComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly canWrite = this.auth.canWrite('PettyCash');
  readonly shops = this.auth.shops;
  readonly activeShopId = this.auth.activeShopId;

  readonly day = signal(today());
  readonly days = signal<PettyCashDayDto[]>([]);
  readonly loadingDays = signal(true);

  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly entryShopId = signal<number | null>(null);
  readonly direction = signal<PettyCashDirection>('In');
  readonly amount = signal(0);
  readonly entryDate = signal(today());
  readonly note = signal('');

  readonly totalClosing = computed(() =>
    this.days().reduce((sum, row) => sum + row.closing, 0),
  );

  readonly columns: GridColumn<Row>[] = [
    { field: 'entryDate', header: 'Date', kind: 'date', width: 130 },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    {
      field: 'cashIn',
      header: 'Cash in',
      kind: 'money',
      width: 120,
      html: true,
      render: (row) =>
        row.cashIn > 0 ? `<span class="tt-pos tt-num">${money(row.cashIn)}</span>` : '',
      cellClass: 'tt-cell-number',
    },
    {
      field: 'cashOut',
      header: 'Cash out',
      kind: 'money',
      width: 120,
      html: true,
      render: (row) =>
        row.cashOut > 0 ? `<span class="tt-neg tt-num">${money(row.cashOut)}</span>` : '',
      cellClass: 'tt-cell-number',
    },
    { field: 'note', header: 'Note', kind: 'text', flex: 2, minWidth: 200 },
    {
      field: 'fromExpense',
      header: 'Source',
      kind: 'bool',
      width: 120,
      html: true,
      render: (row) =>
        row.fromExpense
          ? '<span class="tt-chip tt-chip--neutral">Expense</span>'
          : '<span class="tt-chip tt-chip--info">Drawer</span>',
    },
    { field: 'createdBy', header: 'By', kind: 'text', width: 120, hidden: true },
  ];

  readonly actions: GridAction<Row>[] = this.canWrite
    ? [
        {
          label: 'Remove entry',
          icon: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
          kind: 'danger',
          run: (row) => void this.remove(row),

          // Rows created by a sale or an expense belong to that record, not the drawer.
          visible: (row) => !row.fromExpense,
        },
      ]
    : [];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('petty-cash', request),
    export: (request: QueryRequest) => this.api.export('petty-cash', request),
  };

  constructor() {
    effect(() => {
      const shopId = this.auth.activeShopId();
      this.loadDay(this.day(), shopId);
    });
  }

  loadDay(date: string, shopId: number | null): void {
    this.loadingDays.set(true);
    this.api.get<PettyCashDayDto[]>('petty-cash/day', { date, shopId }).subscribe({
      next: (rows) => {
        this.days.set(rows);
        this.loadingDays.set(false);
      },
      error: () => {
        this.days.set([]);
        this.loadingDays.set(false);
      },
    });
  }

  onDayChange(value: string): void {
    this.day.set(value);
    this.loadDay(value, this.activeShopId());
  }

  openEntry(preset: PettyCashDirection): void {
    this.direction.set(preset);
    this.entryShopId.set(this.activeShopId() ?? this.shops()[0]?.id ?? null);
    this.amount.set(0);
    this.entryDate.set(today());
    this.note.set('');
    this.error.set('');
    this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  save(): void {
    const shopId = this.entryShopId();

    if (shopId === null) {
      this.error.set('Choose a shop.');
      return;
    }

    if (this.amount() <= 0) {
      this.error.set('Enter an amount above zero.');
      return;
    }

    this.error.set('');
    this.saving.set(true);

    this.api
      .post('petty-cash', {
        shopId,
        entryDate: new Date(this.entryDate()).toISOString(),
        direction: this.direction(),
        amount: this.amount(),
        note: this.note().trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.drawerOpen.set(false);
          this.alerts.success(
            this.direction() === 'In' ? 'Cash in recorded' : 'Cash out recorded',
            money(this.amount()),
          );
          this.grid()?.refresh();
          this.loadDay(this.day(), this.activeShopId());
        },
        error: () => this.saving.set(false),
      });
  }

  money(value: number): string {
    return money(value);
  }

  private async remove(row: PettyCashEntryDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: 'Remove this drawer entry?',
      message: 'The cash balance changes from that date onward.',
      confirmLabel: 'Remove entry',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`petty-cash/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Entry removed');
        this.grid()?.refresh();
        this.loadDay(this.day(), this.activeShopId());
      },
    });
  }
}

function money(value: number): string {
  return formatMoney(value);
}
