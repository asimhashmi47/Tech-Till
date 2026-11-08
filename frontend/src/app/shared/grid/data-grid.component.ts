import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Output,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Observable, Subscription, firstValueFrom } from 'rxjs';

import {
  FilterJoin,
  FilterOperator,
  FilterRule,
  PagedResult,
  QueryRequest,
  SortRule,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { HttpDownload, saveBlob } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { currencyCode, formatAmount } from '../../core/services/currency';
import { humanize } from '../../core/services/format';
import { ColumnKind, GridAction, GridColumn, OPERATORS_BY_KIND } from './grid.models';

/** What a feature page hands the grid so it can talk to its own endpoints. */
export interface GridDataSource<T> {
  query: (request: QueryRequest) => Observable<PagedResult<T>>;
  export?: (request: QueryRequest) => Observable<HttpDownload>;
}

type Row = Record<string, unknown>;

interface BuilderRule {
  field: string;
  operator: FilterOperator;
  value: string;
  value2: string;
}

type FilterKind = 'text' | 'number' | 'date' | 'enum' | 'bool';

const kind = (k: ColumnKind | undefined): FilterKind =>
  k === 'number' || k === 'money'
    ? 'number'
    : k === 'date'
      ? 'date'
      : k === 'enum'
        ? 'enum'
        : k === 'bool'
          ? 'bool'
          : 'text';

const CSV_PAGE_SIZE = 500;

/**
 * The one list component in the app: global search, a search row per column, the AND / OR
 * rule builder, column chooser, sort, paging and download. Every column, filter and sort
 * name is a field the server has whitelisted, and paging happens on the server.
 */
@Component({
  selector: 'tt-data-grid',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './data-grid.component.html',
  host: {
    class: 'block',
    '(document:click)': 'onDocClick($event)',
    '(document:keydown.escape)': 'closeMenus()',
  },
})
export class DataGridComponent<T extends Row = Row> {
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Used as the localStorage key for the column chooser, so it must be stable. */
  readonly gridKey = input.required<string>();
  readonly columns = input.required<GridColumn<T>[]>();
  readonly dataSource = input.required<GridDataSource<T>>();

  readonly title = input<string>('');
  readonly actions = input<GridAction<T>[]>([]);
  readonly searchPlaceholder = input('Search all text columns');
  readonly exportName = input('');
  readonly emptyTitle = input('Nothing here yet');
  readonly emptyText = input('Records appear here once they exist.');

  /** Scopes the query to the shop switcher. Turn off for lists that are not shop based. */
  readonly useShopScope = input(true);
  readonly defaultSort = input<SortRule[]>([]);

  @Output() readonly rowClicked = new EventEmitter<T>();

  readonly initialSearch = this.route.snapshot.queryParamMap.get('search') ?? '';

  // State
  readonly rows = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly firstLoad = signal(true);
  readonly loadFailed = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly search = signal(this.initialSearch);
  readonly sortBy = signal<string | null>(null);
  readonly sortDesc = signal(true);
  readonly colFilters = signal<Record<string, string | undefined>>({});
  readonly rules = signal<BuilderRule[]>([]);
  readonly logic = signal<'and' | 'or'>('and');
  readonly hiddenCols = signal<Set<string>>(new Set());
  readonly showFilterRow = signal(true);
  readonly exporting = signal<string | null>(null);

  // Menus
  readonly menu = signal<'columns' | 'export' | 'filters' | null>(null);
  draftRules: BuilderRule[] = [];
  draftLogic: 'and' | 'or' = 'and';

  readonly humanize = humanize;
  readonly pageSizes = [10, 25, 50, 100, 200];
  readonly exportable = computed(() => !!this.dataSource().export);
  readonly visibleColumns = computed(() =>
    this.columns().filter((c) => !this.hiddenCols().has(c.field)),
  );
  readonly filterableColumns = computed(() => this.columns().filter((c) => c.filterable !== false));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly rangeFrom = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  readonly rangeTo = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  readonly activeFilterCount = computed(
    () =>
      Object.values(this.colFilters()).filter((v) => v !== '' && v != null).length +
      this.rules().length,
  );
  readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  readonly pages = computed(() => {
    const count = this.pageCount(),
      cur = this.page();
    const set = new Set([1, count, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= count));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
      out.push(p);
    });
    return out;
  });

  private sub?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private filterTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // A new key means a new column set (the ageing screen swaps views this way).
    effect(() => {
      const id = this.gridKey();
      untracked(() => this.resetFor(id));
    });

    // Reloads whenever anything that shapes the query changes.
    effect(() => {
      const request = this.buildRequest(this.page(), this.pageSize());
      const source = this.dataSource();
      untracked(() => this.fetch(source, request));
    });

    // The topbar search links here with ?search=, including while this page is already open.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const term = params.get('search') ?? '';
      if (term === untracked(this.search)) return;
      this.search.set(term);
      this.page.set(1);
      const box = this.host.nativeElement.querySelector<HTMLInputElement>('input[data-search]');
      if (box) box.value = term;
    });

    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
  }

  /** Re-runs the current query, for example after a save or a shop change. */
  refresh(): void {
    this.reload();
  }

  reload(): void {
    this.fetch(this.dataSource(), this.buildRequest(this.page(), this.pageSize()));
  }

  private resetFor(id: string): void {
    const saved = this.readPrefs(id);
    this.pageSize.set(saved?.pageSize ?? 25);
    this.hiddenCols.set(
      new Set(saved?.hidden ?? this.columns().filter((c) => c.hidden).map((c) => c.field)),
    );
    const sort = this.defaultSort()[0];
    this.sortBy.set(sort?.field ?? null);
    this.sortDesc.set(sort?.desc ?? true);
    this.colFilters.set({});
    this.rules.set([]);
    this.page.set(1);
  }

  private sortRules(): SortRule[] {
    const field = this.sortBy();
    if (!field) return this.defaultSort();
    return [
      { field, desc: this.sortDesc() },
      ...this.defaultSort().filter((rule) => rule.field !== field),
    ];
  }

  private buildRequest(page: number, pageSize: number): QueryRequest {
    const rules = this.rules();
    return {
      page,
      pageSize,
      sort: this.sortRules(),
      filters: this.columnRules(),
      filterGroup: rules.length
        ? {
            join: this.logic() === 'and' ? FilterJoin.And : FilterJoin.Or,
            rules: rules.map((r) => ({
              field: r.field,
              operator: Number(r.operator),
              value: r.value === '' ? null : r.value,
              value2: r.value2 === '' ? null : r.value2,
            })),
            groups: [],
          }
        : null,
      search: this.search() || null,
      columns: untracked(this.visibleColumns).map((c) => c.field),
      shopId: this.useShopScope() ? this.auth.activeShopId() : null,
    };
  }

  /** Turns the search row into the rules the API whitelists. */
  private columnRules(): FilterRule[] {
    const rules: FilterRule[] = [];
    for (const [field, raw] of Object.entries(this.colFilters())) {
      if (!raw) continue;
      const k = kind(this.col(field)?.kind);
      if (k === 'enum' || k === 'bool') {
        rules.push({ field, operator: FilterOperator.Equals, value: raw, value2: null });
      } else if (k === 'date') {
        const rule = dateRule(field, raw);
        if (rule) rules.push(rule);
      } else if (k === 'number') {
        const rule = numberRule(field, raw);
        if (rule) rules.push(rule);
      } else {
        rules.push({ field, operator: FilterOperator.Contains, value: raw.trim(), value2: null });
      }
    }
    return rules;
  }

  private fetch(source: GridDataSource<T>, request: QueryRequest): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = source.query(request).subscribe({
      next: (r) => {
        this.rows.set(r.items);
        this.total.set(r.totalCount);
        this.loadFailed.set(false);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  // Toolbar

  onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search.set(value.trim());
      this.page.set(1);
    }, 300);
  }

  setColFilter(key: string, value: string, debounce = true): void {
    clearTimeout(this.filterTimer);
    const apply = () => {
      this.colFilters.update((f) => ({ ...f, [key]: value }));
      this.page.set(1);
    };
    if (debounce) this.filterTimer = setTimeout(apply, 350);
    else apply();
  }

  setDateRange(key: string, part: 0 | 1, value: string): void {
    const [a, b] = (this.colFilters()[key] ?? '').split('..');
    const next = part === 0 ? [value, b ?? ''] : [a ?? '', value];
    this.setColFilter(key, next[0] || next[1] ? `${next[0]}..${next[1]}` : '', false);
  }

  dateRangePart(key: string, part: 0 | 1): string {
    return (this.colFilters()[key] ?? '').split('..')[part] ?? '';
  }

  clearAll(): void {
    this.colFilters.set({});
    this.rules.set([]);
    this.search.set('');
    const box = this.host.nativeElement.querySelector<HTMLInputElement>('input[data-search]');
    if (box) box.value = '';
    this.host.nativeElement
      .querySelectorAll<HTMLInputElement>('[data-colfilter]')
      .forEach((i) => (i.value = ''));
    this.page.set(1);
  }

  sort(col: GridColumn<T>): void {
    if (col.sortable === false) return;
    if (this.sortBy() === col.field) {
      if (this.sortDesc()) this.sortDesc.set(false);
      else {
        const sort = this.defaultSort()[0];
        this.sortBy.set(sort?.field ?? null);
        this.sortDesc.set(sort?.desc ?? true);
      }
    } else {
      this.sortBy.set(col.field);
      this.sortDesc.set(true);
    }
    this.page.set(1);
  }

  goTo(p: number): void {
    if (p >= 1 && p <= this.pageCount() && p !== this.page()) this.page.set(p);
  }

  setPageSize(size: number): void {
    this.pageSize.set(+size);
    this.page.set(1);
    this.savePrefs();
  }

  toggleColumn(key: string): void {
    this.hiddenCols.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else if (this.visibleColumns().length > 1) n.add(key);
      return n;
    });
    this.savePrefs();
  }

  // Advanced filter builder

  openFilters(): void {
    this.draftRules = this.rules().map((r) => ({ ...r }));
    if (this.draftRules.length === 0) this.addRule();
    this.draftLogic = this.logic();
    this.menu.set(this.menu() === 'filters' ? null : 'filters');
  }

  addRule(): void {
    const col = this.filterableColumns()[0];
    if (!col) return;
    this.draftRules = [
      ...this.draftRules,
      { field: col.field, operator: this.opsFor(col.field)[0].value, value: '', value2: '' },
    ];
  }

  removeRule(i: number): void {
    this.draftRules = this.draftRules.filter((_, idx) => idx !== i);
  }

  onRuleField(rule: BuilderRule): void {
    rule.operator = this.opsFor(rule.field)[0].value;
    rule.value = '';
    rule.value2 = '';
  }

  applyRules(): void {
    const valid = this.draftRules.filter(
      (r) => this.needsValue(r) === 0 || (r.value ?? '') !== '',
    );
    this.rules.set(valid.map((r) => ({ ...r })));
    this.logic.set(this.draftLogic);
    this.page.set(1);
    this.menu.set(null);
  }

  clearRules(): void {
    this.draftRules = [];
    this.rules.set([]);
    this.page.set(1);
    this.menu.set(null);
  }

  removeAppliedRule(i: number): void {
    this.rules.update((r) => r.filter((_, idx) => idx !== i));
    this.page.set(1);
  }

  opsFor(field: string): { value: FilterOperator; label: string }[] {
    return OPERATORS_BY_KIND[this.col(field)?.kind ?? 'text'];
  }

  needsValue(rule: BuilderRule): number {
    const op = Number(rule.operator);
    if (op === FilterOperator.IsEmpty || op === FilterOperator.IsNotEmpty) return 0;
    return op === FilterOperator.Between ? 2 : 1;
  }

  col(key: string): GridColumn<T> | undefined {
    return this.columns().find((c) => c.field === key);
  }

  kindOf(c: GridColumn<T> | undefined): FilterKind {
    return kind(c?.kind);
  }

  optionsFor(field: string): readonly string[] {
    const c = this.col(field);
    return c?.kind === 'bool' ? ['true', 'false'] : (c?.options ?? []);
  }

  inputTypeFor(field: string): string {
    const k = kind(this.col(field)?.kind);
    return k === 'number' ? 'number' : k === 'date' ? 'date' : 'text';
  }

  describeRule(r: BuilderRule): string {
    const c = this.col(r.field);
    const op = this.opsFor(r.field).find((o) => Number(o.value) === Number(r.operator));
    const needs = this.needsValue(r);
    const val = needs === 2 ? `${r.value} and ${r.value2}` : needs === 1 ? humanize(r.value) : '';
    return `${c?.header ?? r.field} ${op?.label ?? ''} ${val}`.trim();
  }

  describeColFilter(key: string, value: string): string {
    const c = this.col(key);
    return `${c?.header ?? key}: ${humanize(value).replace('..', ' → ')}`;
  }

  colFilterEntries(): [string, string][] {
    return Object.entries(this.colFilters()).filter(([, v]) => v !== '' && v != null) as [
      string,
      string,
    ][];
  }

  clearColFilter(key: string): void {
    this.colFilters.update((f) => {
      const n = { ...f };
      delete n[key];
      return n;
    });
    const el = this.host.nativeElement.querySelector<HTMLInputElement>(
      `[data-colfilter="${key}"]`,
    );
    if (el) el.value = '';
    this.page.set(1);
  }

  // Export

  async export(format: 'xlsx' | 'csv'): Promise<void> {
    this.menu.set(null);
    this.exporting.set(format);
    try {
      if (format === 'xlsx') {
        const source = this.dataSource().export;
        if (!source) return;
        // The export mirrors what is on screen: same filters, same sort, same columns.
        saveBlob(await firstValueFrom(source(this.buildRequest(1, Math.max(this.total(), 1)))));
      } else {
        await this.exportCsv();
      }
      this.alerts.success(
        'Download ready',
        `${this.total().toLocaleString()} rows exported to ${format === 'xlsx' ? 'Excel' : 'CSV'}.`,
      );
    } catch {
      // The interceptor already explained why.
    } finally {
      this.exporting.set(null);
    }
  }

  private async exportCsv(): Promise<void> {
    const columns = this.visibleColumns();
    const rows: T[] = [];
    for (let page = 1; ; page++) {
      const result = await firstValueFrom(
        this.dataSource().query(this.buildRequest(page, CSV_PAGE_SIZE)),
      );
      rows.push(...result.items);
      if (rows.length >= result.totalCount || result.items.length === 0) break;
    }

    const lines = [
      columns.map((c) => csvCell(this.headerOf(c))),
      ...rows.map((row) => columns.map((c) => csvCell(this.csvValue(row, c)))),
    ];
    saveBlob({
      blob: new Blob(['﻿' + lines.map((l) => l.join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      filename: `${this.exportName() || this.gridKey()}.csv`,
    });
  }

  private csvValue(row: T, c: GridColumn<T>): string {
    if (c.kind === 'money' || c.kind === 'number') return String(row[c.field] ?? '');
    if (c.render && !c.html) return c.render(row);
    return this.isBlank(row, c) ? '' : this.rawText(row, c);
  }

  // Cells

  headerOf(c: GridColumn<T>): string {
    // The currency is named once in the header rather than repeated in every cell.
    return c.kind === 'money' ? `${c.header} (${currencyCode()})` : c.header;
  }

  widthOf(c: GridColumn<T>): string | null {
    return c.width ? `${c.width}px` : null;
  }

  isBlank(row: T, c: GridColumn<T>): boolean {
    if (c.render) return false;
    const v = row[c.field];
    return v === null || v === undefined || v === '';
  }

  cellText(row: T, c: GridColumn<T>): string {
    if (c.render) return c.render(row);
    return this.isBlank(row, c) ? '—' : this.rawText(row, c);
  }

  private rawText(row: T, c: GridColumn<T>): string {
    const v = row[c.field];
    switch (c.kind) {
      case 'money':
        return formatAmount(v);
      case 'number':
        return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
      case 'date':
        return formatDate(v);
      case 'bool':
        return v ? 'Yes' : 'No';
      case 'enum':
        return humanize(String(v));
      default:
        return String(v);
    }
  }

  isNumeric(c: GridColumn<T>): boolean {
    return kind(c.kind) === 'number';
  }

  visibleActions(row: T): GridAction<T>[] {
    return this.actions().filter((a) => !a.visible || a.visible(row));
  }

  clickableRows(): boolean {
    return this.rowClicked.observed;
  }

  // Menus

  toggleMenu(m: 'columns' | 'export', ev: Event): void {
    ev.stopPropagation();
    this.menu.set(this.menu() === m ? null : m);
  }

  closeMenus(): void {
    this.menu.set(null);
  }

  onDocClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    if (this.menu() && !t.closest('[data-menu]')) this.menu.set(null);
  }

  private prefsKey(id: string): string {
    return `techtill.grid.${id}.prefs`;
  }

  private readPrefs(id: string): { pageSize?: number; hidden?: string[] } | null {
    try {
      return JSON.parse(localStorage.getItem(this.prefsKey(id)) ?? 'null');
    } catch {
      return null;
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(
        this.prefsKey(this.gridKey()),
        JSON.stringify({ pageSize: this.pageSize(), hidden: [...this.hiddenCols()] }),
      );
    } catch {
      // The grid still works, the choice just will not be remembered.
    }
  }
}

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const RANGE = new RegExp(`^(${NUMBER})\\s*\\.\\.\\s*(${NUMBER})$`);
const COMPARE = new RegExp(`^(>=|<=|!=|>|<|=)?\\s*(${NUMBER})$`);
const COMPARE_OPS: Record<string, FilterOperator> = {
  '>': FilterOperator.GreaterThan,
  '>=': FilterOperator.GreaterThanOrEqual,
  '<': FilterOperator.LessThan,
  '<=': FilterOperator.LessThanOrEqual,
  '!=': FilterOperator.NotEquals,
  '=': FilterOperator.Equals,
};

/** Reads ">500", "<=20", "10..20" or a plain number. Anything else filters nothing. */
export function numberRule(field: string, raw: string): FilterRule | null {
  const text = raw.trim();
  const range = RANGE.exec(text);
  if (range) {
    return { field, operator: FilterOperator.Between, value: range[1], value2: range[2] };
  }

  const match = COMPARE.exec(text);
  return match
    ? { field, operator: COMPARE_OPS[match[1] ?? '='], value: match[2], value2: null }
    : null;
}

/** Reads "from..to". The server treats a Between end date as the whole of that day. */
export function dateRule(field: string, raw: string): FilterRule | null {
  const [from, to] = raw.split('..');
  if (from && to) return { field, operator: FilterOperator.Between, value: from, value2: to };
  if (from) return { field, operator: FilterOperator.GreaterThanOrEqual, value: from, value2: null };
  if (to) return { field, operator: FilterOperator.Between, value: '1900-01-01', value2: to };
  return null;
}

/** Quotes a CSV cell, and stops a spreadsheet reading text as a formula. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value)) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function formatDate(value: unknown): string {
  if (!value) {
    return '';
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMoney(value: unknown): string {
  return formatAmount(value);
}
