import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  SimpleChanges,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  ModuleRegistry,
  SortModelItem,
} from 'ag-grid-community';
import { Observable } from 'rxjs';

import {
  FilterGroup,
  FilterJoin,
  FilterOperator,
  FilterRule,
  PagedResult,
  QueryRequest,
  SortRule,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { activeCurrency, currencyCode, formatAmount } from '../../core/services/currency';
import { HttpDownload, saveBlob } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { GridAction, GridColumn, OPERATORS_BY_KIND, PAGE_SIZES } from './grid.models';

ModuleRegistry.registerModules([AllCommunityModule]);

/** What a feature page hands the grid so it can talk to its own endpoints. */
export interface GridDataSource<T> {
  query: (request: QueryRequest) => Observable<PagedResult<T>>;
  export?: (request: QueryRequest) => Observable<HttpDownload>;
}

type Row = Record<string, unknown>;

/**
 * The one list component in the app. Every column, filter and sort name is a field the
 * server has whitelisted, and paging happens on the server through AG Grid's infinite
 * row model, so a 10,000 row table only ever ships one page.
 */
@Component({
  selector: 'tt-data-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './data-grid.component.html',
  styleUrl: './data-grid.component.scss',
})
export class DataGridComponent<T extends Row = Row> {
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  /** Used as the localStorage key for the column chooser, so it must be stable. */
  @Input({ required: true }) gridKey!: string;
  @Input({ required: true }) columns: GridColumn<T>[] = [];
  @Input({ required: true }) dataSource!: GridDataSource<T>;

  @Input() actions: GridAction<T>[] = [];
  @Input() searchPlaceholder = 'Search';
  @Input() exportName = 'export';
  @Input() emptyTitle = 'Nothing here yet';
  @Input() emptyText = 'Records appear here once they exist.';

  /** Scopes the query to the shop switcher. Turn off for lists that are not shop based. */
  @Input() useShopScope = true;

  @Input() defaultSort: SortRule[] = [];
  @Input() height = '560px';

  @Output() readonly rowClicked = new EventEmitter<T>();

  readonly quickSearch = signal('');
  readonly totalCount = signal<number | null>(null);
  readonly loadFailed = signal(false);
  readonly chooserOpen = signal(false);
  readonly builderOpen = signal(false);
  readonly exporting = signal(false);

  /** The advanced filter builder's working copy. Applied only when the user says so. */
  readonly builderRules = signal<BuilderRule[]>([]);
  readonly builderJoin = signal<FilterJoin>(FilterJoin.And);
  readonly appliedGroup = signal<FilterGroup | null>(null);

  readonly hiddenFields = signal<Set<string>>(new Set());

  readonly visibleColumns = computed(() =>
    this.columns.filter((column) => !this.hiddenFields().has(column.field)),
  );

  readonly activeFilterCount = computed(() => {
    const group = this.appliedGroup();
    return group ? group.rules.length : 0;
  });

  readonly pageSizes = PAGE_SIZES;

  private api?: GridApi<T>;
  private lastSort: SortRule[] = [];
  private lastColumnFilters: FilterRule[] = [];

  readonly gridOptions: GridOptions<T> = {
    // The stylesheet uses the classic quartz CSS, so the legacy theming path stays on.
    theme: 'legacy',
    rowModelType: 'infinite',
    pagination: true,
    paginationPageSize: 25,
    paginationPageSizeSelector: [...PAGE_SIZES],
    cacheBlockSize: 25,
    maxBlocksInCache: 2,
    animateRows: false,
    suppressCellFocus: true,
    rowHeight: 42,
    headerHeight: 40,
    floatingFiltersHeight: 38,

    // Shift-click adds a column to the sort rather than replacing it.
    multiSortKey: 'ctrl',
    alwaysMultiSort: false,
    defaultColDef: {
      sortable: true,
      resizable: true,
      suppressHeaderMenuButton: true,
      filterParams: { buttons: ['reset'], debounceMs: 400, maxNumConditions: 1 },
    },
    overlayNoRowsTemplate: '<span class="tt-grid-overlay">No rows match the current filters.</span>',
    overlayLoadingTemplate: '<span class="tt-grid-overlay">Loading</span>',
  };

  columnDefs: ColDef<T>[] = [];

  constructor() {
    // A currency change alters the money headers and the number of decimals, so the
    // grid rebuilds its columns and reloads the page that is on screen.
    effect(() => {
      activeCurrency();

      if (this.api) {
        this.rebuildColumnDefs();
        this.api.setGridOption('columnDefs', this.columnDefs);
        this.refresh();
      }
    });
  }

  ngOnInit(): void {
    this.hiddenFields.set(this.readHidden());
    this.rebuildColumnDefs();
    this.builderRules.set([this.newBuilderRule()]);
  }

  /**
   * A page can swap the whole column set, for example the ageing screen switching between
   * its party view and its document view. Rebuild rather than ignore the new inputs.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.api) {
      // First run: ngOnInit does the initial build.
      return;
    }

    if (changes['columns'] || changes['gridKey'] || changes['dataSource']) {
      this.hiddenFields.set(this.readHidden());
      this.rebuildColumnDefs();
      this.api.setGridOption('columnDefs', this.columnDefs);
      this.refresh();
    }
  }

  onGridReady(event: GridReadyEvent<T>): void {
    this.api = event.api;

    if (this.defaultSort.length > 0) {
      // Pushing the default into the grid means the first datasource call carries it.
      this.api.applyColumnState({
        state: this.defaultSort.map((rule, index) => ({
          colId: rule.field,
          sort: rule.desc ? 'desc' : 'asc',
          sortIndex: index,
        })),
      });
    }

    this.api.setGridOption('datasource', this.buildDatasource());
  }

  /** Re-runs the current query, for example after a save or a shop change. */
  refresh(): void {
    this.loadFailed.set(false);
    this.api?.setGridOption('datasource', this.buildDatasource());
  }

  onQuickSearch(value: string): void {
    this.quickSearch.set(value);
    this.refresh();
  }

  clearQuickSearch(): void {
    this.quickSearch.set('');
    this.refresh();
  }

  // ---------- Column chooser ----------

  toggleChooser(): void {
    this.chooserOpen.update((v) => !v);
    this.builderOpen.set(false);
  }

  isColumnVisible(field: string): boolean {
    return !this.hiddenFields().has(field);
  }

  toggleColumn(field: string, visible: boolean): void {
    const next = new Set(this.hiddenFields());
    if (visible) {
      next.delete(field);
    } else {
      next.add(field);
    }

    this.hiddenFields.set(next);
    this.writeHidden(next);
    this.api?.setGridOption('columnDefs', this.buildColumnDefs());
  }

  showAllColumns(): void {
    this.hiddenFields.set(new Set());
    this.writeHidden(new Set());
    this.api?.setGridOption('columnDefs', this.buildColumnDefs());
  }

  // ---------- Advanced filter builder ----------

  toggleBuilder(): void {
    this.builderOpen.update((v) => !v);
    this.chooserOpen.set(false);
  }

  addBuilderRule(): void {
    this.builderRules.update((rules) => [...rules, this.newBuilderRule()]);
  }

  removeBuilderRule(index: number): void {
    this.builderRules.update((rules) => rules.filter((_, i) => i !== index));
  }

  operatorsFor(field: string): { value: FilterOperator; label: string }[] {
    const column = this.columns.find((c) => c.field === field);
    return column ? [...OPERATORS_BY_KIND[column.kind]] : [...OPERATORS_BY_KIND.text];
  }

  builderInputType(field: string): string {
    const kind = this.columns.find((c) => c.field === field)?.kind;
    if (kind === 'date') {
      return 'date';
    }

    return kind === 'number' || kind === 'money' ? 'number' : 'text';
  }

  needsSecondValue(operator: FilterOperator): boolean {
    return Number(operator) === FilterOperator.Between;
  }

  needsNoValue(operator: FilterOperator): boolean {
    const op = Number(operator);
    return op === FilterOperator.IsEmpty || op === FilterOperator.IsNotEmpty;
  }

  enumOptionsFor(field: string): readonly string[] {
    return this.columns.find((c) => c.field === field)?.options ?? [];
  }

  applyBuilder(): void {
    const rules = this.builderRules()
      .filter((rule) => rule.field && (this.needsNoValue(rule.operator) || rule.value !== ''))
      .map<FilterRule>((rule) => ({
        field: rule.field,
        operator: Number(rule.operator),
        value: rule.value === '' ? null : rule.value,
        value2: rule.value2 === '' ? null : rule.value2,
      }));

    this.appliedGroup.set(
      rules.length === 0 ? null : { join: Number(this.builderJoin()), rules, groups: [] },
    );

    this.builderOpen.set(false);
    this.refresh();
  }

  clearBuilder(): void {
    this.builderRules.set([this.newBuilderRule()]);
    this.builderJoin.set(FilterJoin.And);
    this.appliedGroup.set(null);
    this.builderOpen.set(false);
    this.refresh();
  }

  // ---------- Export ----------

  exportToExcel(): void {
    const source = this.dataSource.export;
    if (!source) {
      return;
    }

    this.exporting.set(true);

    // The export mirrors what is on screen: same filters, same sort, same visible columns.
    source(this.buildRequest(1, Math.max(this.totalCount() ?? 1000, 1))).subscribe({
      next: (download) => {
        saveBlob(download);
        this.exporting.set(false);
        this.alerts.success('Export ready', download.filename);
      },
      error: () => this.exporting.set(false),
    });
  }

  // ---------- Internals ----------

  private buildDatasource(): IDatasource {
    return {
      getRows: (params: IGetRowsParams) => {
        const pageSize = this.api?.paginationGetPageSize() ?? 25;
        const page = Math.floor(params.startRow / pageSize) + 1;

        this.lastSort = mapSort(params.sortModel);
        this.lastColumnFilters = mapFilterModel(params.filterModel as Record<string, AgFilterModel>);

        this.dataSource.query(this.buildRequest(page, pageSize)).subscribe({
          next: (result) => {
            this.totalCount.set(result.totalCount);
            this.loadFailed.set(false);
            params.successCallback(result.items as Row[] as T[], result.totalCount);

            if (result.totalCount === 0) {
              this.api?.showNoRowsOverlay();
            }
          },
          error: () => {
            this.loadFailed.set(true);
            params.failCallback();
          },
        });
      },
    };
  }

  private buildRequest(page: number, pageSize: number): QueryRequest {
    const search = this.quickSearch().trim();

    return {
      page,
      pageSize,
      sort: this.lastSort.length > 0 ? this.lastSort : this.defaultSort,
      filters: this.lastColumnFilters,
      filterGroup: this.appliedGroup(),
      search: search === '' ? null : search,
      columns: this.visibleColumns().map((column) => column.field),
      shopId: this.useShopScope ? this.auth.activeShopId() : null,
    };
  }

  private rebuildColumnDefs(): void {
    this.columnDefs = this.buildColumnDefs();
  }

  private buildColumnDefs(): ColDef<T>[] {
    const defs: ColDef<T>[] = this.columns.map((column) => {
      const def: ColDef<T> = {
        colId: column.field,
        field: column.field as ColDef<T>['field'],

        // The currency is named once in the header rather than repeated in every cell.
        headerName: column.kind === 'money' ? `${column.header} (${currencyCode()})` : column.header,
        hide: this.hiddenFields().has(column.field),
        sortable: column.sortable !== false,
        width: column.width,
        minWidth: column.minWidth ?? 110,
        flex: column.width ? undefined : column.flex ?? 1,
        cellClass: column.cellClass ?? defaultCellClass(column.kind),
      };

      if (column.filterable !== false) {
        def.filter = agFilterFor(column.kind);
        def.floatingFilter = true;
      }

      if (column.render) {
        if (column.html) {
          def.cellRenderer = (params: { data?: T }) =>
            params.data ? column.render!(params.data) : '';
        } else {
          def.valueFormatter = (params: { data?: T }) =>
            params.data ? column.render!(params.data) : '';
        }
      } else if (column.kind === 'money') {
        def.valueFormatter = (params: { value: unknown }) => formatAmount(params.value);
      } else if (column.kind === 'date') {
        def.valueFormatter = (params: { value: unknown }) => formatDate(params.value);
      } else if (column.kind === 'bool') {
        def.valueFormatter = (params: { value: unknown }) => (params.value ? 'Yes' : 'No');
      }

      return def;
    });

    if (this.actions.length > 0) {
      defs.push({
        colId: '__actions',
        headerName: '',
        pinned: 'right',
        width: 52 + this.actions.length * 4,
        minWidth: 56,
        maxWidth: 140,
        sortable: false,
        filter: false,
        resizable: false,
        cellClass: 'tt-cell-actions',
        cellRenderer: ActionsCellRenderer,
        cellRendererParams: { actions: this.actions },
      });
    }

    return defs;
  }

  private newBuilderRule(): BuilderRule {
    const field = this.columns[0]?.field ?? '';
    const operators = this.operatorsFor(field);

    return {
      field,
      operator: operators[0]?.value ?? FilterOperator.Contains,
      value: '',
      value2: '',
    };
  }

  private storageKey(): string {
    return `techtill.grid.${this.gridKey}.hidden`;
  }

  private readHidden(): Set<string> {
    const fromColumns = this.columns.filter((c) => c.hidden).map((c) => c.field);

    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return new Set(fromColumns);
      }

      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set(fromColumns);
    }
  }

  private writeHidden(fields: Set<string>): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify([...fields]));
    } catch {
      // The grid still works, the choice just will not be remembered.
    }
  }
}

interface BuilderRule {
  field: string;
  operator: FilterOperator;
  value: string;
  value2: string;
}

interface AgFilterModel {
  filterType: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  dateFrom?: string;
  dateTo?: string;
}

/** Row action buttons. A plain renderer keeps the grid free of extra dependencies. */
class ActionsCellRenderer {
  private element!: HTMLElement;

  init(params: { data?: Row; actions: GridAction<Row>[] }): void {
    this.element = document.createElement('div');
    this.element.className = 'tt-grid-actions';

    for (const action of params.actions) {
      if (!params.data || (action.visible && !action.visible(params.data))) {
        continue;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tt-grid-action' + (action.kind === 'danger' ? ' tt-grid-action--danger' : '');
      button.title = action.label;
      button.setAttribute('aria-label', action.label);
      button.innerHTML = action.icon
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${action.icon}"/></svg>`
        : action.label;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        action.run(params.data as Row);
      });

      this.element.appendChild(button);
    }
  }

  getGui(): HTMLElement {
    return this.element;
  }

  refresh(): boolean {
    return false;
  }
}

function agFilterFor(kind: GridColumn['kind']): string {
  switch (kind) {
    case 'number':
    case 'money':
      return 'agNumberColumnFilter';
    case 'date':
      return 'agDateColumnFilter';
    default:
      return 'agTextColumnFilter';
  }
}

function defaultCellClass(kind: GridColumn['kind']): string | undefined {
  return kind === 'money' || kind === 'number' ? 'tt-cell-number' : undefined;
}

function mapSort(sortModel: SortModelItem[]): SortRule[] {
  return sortModel.map((item) => ({ field: item.colId, desc: item.sort === 'desc' }));
}

/**
 * Translates AG Grid's filter model into the API's FilterRule list. Only the operators
 * the backend whitelists are produced; anything else is dropped rather than guessed at.
 */
function mapFilterModel(model: Record<string, AgFilterModel>): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const [field, entry] of Object.entries(model ?? {})) {
    const operator = mapOperator(entry.type);
    if (operator === null) {
      continue;
    }

    if (entry.filterType === 'date') {
      const from = (entry.dateFrom ?? '').slice(0, 10);
      const to = (entry.dateTo ?? '').slice(0, 10);
      if (!from) {
        continue;
      }

      rules.push({ field, operator, value: from, value2: to || null });
      continue;
    }

    const value = entry.filter;
    if (value === null || value === undefined || value === '') {
      if (operator !== FilterOperator.IsEmpty && operator !== FilterOperator.IsNotEmpty) {
        continue;
      }
    }

    rules.push({
      field,
      operator,
      value: value === null || value === undefined ? null : String(value),
      value2: entry.filterTo === null || entry.filterTo === undefined ? null : String(entry.filterTo),
    });
  }

  return rules;
}

function mapOperator(type: string | undefined): FilterOperator | null {
  switch (type) {
    case 'contains':
      return FilterOperator.Contains;
    case 'equals':
      return FilterOperator.Equals;
    case 'notEqual':
      return FilterOperator.NotEquals;
    case 'startsWith':
      return FilterOperator.StartsWith;
    case 'endsWith':
      return FilterOperator.EndsWith;
    case 'greaterThan':
    case 'after':
      return FilterOperator.GreaterThan;
    case 'greaterThanOrEqual':
      return FilterOperator.GreaterThanOrEqual;
    case 'lessThan':
    case 'before':
      return FilterOperator.LessThan;
    case 'lessThanOrEqual':
      return FilterOperator.LessThanOrEqual;
    case 'inRange':
      return FilterOperator.Between;
    case 'blank':
      return FilterOperator.IsEmpty;
    case 'notBlank':
      return FilterOperator.IsNotEmpty;
    default:
      return null;
  }
}

export function formatMoney(value: unknown): string {
  return formatAmount(value);
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
