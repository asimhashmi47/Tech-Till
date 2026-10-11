import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';

import {
  AgeingResultDto,
  AgeingRowDto,
  AgeingSummaryDto,
  PagedResult,
  QueryRequest,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridColumn } from '../../shared/grid/grid.models';
import { formatMoney } from '../../core/services/currency';

type Row = AgeingRowDto & Record<string, unknown>;
type Mode = 'receivable' | 'payable';

const EMPTY: AgeingSummaryDto = {
  current: 0,
  days1To30: 0,
  days31To60: 0,
  days61To90: 0,
  over90: 0,
  total: 0,
};

/**
 * Receivable and payable ageing. The same screen serves both, and both views, because the
 * two only differ in which endpoint they call and what the buckets are called on screen.
 */
@Component({
  selector: 'tt-ageing',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  templateUrl: './ageing.component.html',
  styleUrl: './ageing.component.scss',
})
export class AgeingComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  private readonly routeData = toSignal(this.route.data, { initialValue: { mode: 'receivable' } });

  readonly mode = computed<Mode>(() => (this.routeData()['mode'] as Mode) ?? 'receivable');
  readonly byDocument = signal(false);
  readonly summary = signal<AgeingSummaryDto>(EMPTY);

  readonly isReceivable = computed(() => this.mode() === 'receivable');

  readonly title = computed(() =>
    this.isReceivable() ? 'Receivables ageing' : 'Payables ageing',
  );

  readonly blurb = computed(() =>
    this.isReceivable()
      ? 'How long customer balances have been outstanding, measured from the invoice date.'
      : 'How long supplier balances have been outstanding, measured from the bill date.',
  );

  readonly partyHeader = computed(() => (this.isReceivable() ? 'Customer' : 'Supplier'));
  readonly documentHeader = computed(() => (this.isReceivable() ? 'Invoice' : 'Bill'));

  readonly buckets = computed(() => {
    const s = this.summary();
    return [
      { label: 'Current', value: s.current, tone: 'slate' },
      { label: '1 to 30 days', value: s.days1To30, tone: 'amber' },
      { label: '31 to 60 days', value: s.days31To60, tone: 'orange' },
      { label: '61 to 90 days', value: s.days61To90, tone: 'orange-deep' },
      { label: 'Over 90 days', value: s.over90, tone: 'rose' },
    ];
  });

  /** Rebuilt when the view switches, so the grid resets its key and columns together. */
  readonly columns = computed<GridColumn<Row>[]>(() => {
    const base: GridColumn<Row>[] = [
      { field: 'partyName', header: this.partyHeader(), kind: 'text', flex: 2, minWidth: 180 },
    ];

    if (this.byDocument()) {
      base.push(
        { field: 'documentNo', header: this.documentHeader(), kind: 'text', width: 170 },
        { field: 'documentDate', header: 'Date', kind: 'date', width: 125 },
        { field: 'ageDays', header: 'Age', kind: 'number', width: 85 },
      );
    }

    base.push(
      { field: 'current', header: 'Current', kind: 'money', width: 115 },
      { field: 'days1To30', header: '1 to 30', kind: 'money', width: 110 },
      { field: 'days31To60', header: '31 to 60', kind: 'money', width: 110 },
      { field: 'days61To90', header: '61 to 90', kind: 'money', width: 110 },
      { field: 'over90', header: 'Over 90', kind: 'money', width: 110 },
      { field: 'total', header: 'Total', kind: 'money', width: 125 },
    );

    return base;
  });

  readonly gridKey = computed(
    () => `ageing-${this.mode()}-${this.byDocument() ? 'document' : 'party'}`,
  );

  readonly dataSource = computed<GridDataSource<Row>>(() => {
    const path = this.isReceivable() ? 'ageing/receivable' : 'ageing/payable';
    const invoiceWise = String(this.byDocument());

    return {
      query: (request: QueryRequest) =>
        new Observable<PagedResult<Row>>((subscriber) => {
          const sub = this.api
            .post<AgeingResultDto>(`${path}?invoiceWise=${invoiceWise}`, request)
            .subscribe({
              next: (result) => {
                this.summary.set(result.summary);
                subscriber.next(result.rows as PagedResult<Row>);
                subscriber.complete();
              },
              error: (error) => subscriber.error(error),
            });

          return () => sub.unsubscribe();
        }),

      export: (request: QueryRequest) =>
        this.api.export(path, request, { invoiceWise }),
    };
  });

  setView(byDocument: boolean): void {
    this.byDocument.set(byDocument);
  }

  money(value: number): string {
    return formatMoney(value);
  }

  share(value: number): number {
    const total = this.summary().total;
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }
}
