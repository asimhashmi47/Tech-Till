import { provideHttpClient } from '@angular/common/http';
import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import { of, throwError } from 'rxjs';

import { APP_ICONS } from '../../core/icons';
import { FilterJoin, FilterOperator, PagedResult, QueryRequest } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from './data-grid.component';
import { GridAction, GridColumn } from './grid.models';

type Row = Record<string, unknown>;

@Component({
  imports: [DataGridComponent],
  template: `<tt-data-grid
    gridKey="spec"
    [columns]="columns"
    [dataSource]="source()"
    [actions]="actions"
    [defaultSort]="[{ field: 'name', desc: false }]"
  />`,
})
class Host {
  readonly grid = viewChild.required(DataGridComponent);
  readonly source = signal<GridDataSource<Row>>({ query: () => of({} as PagedResult<Row>) });
  columns: GridColumn<Row>[] = [
    { field: 'name', header: 'Name', kind: 'text' },
    { field: 'qty', header: 'Qty', kind: 'number' },
    { field: 'price', header: 'Price', kind: 'money' },
    { field: 'on', header: 'On', kind: 'date' },
    { field: 'state', header: 'State', kind: 'enum', options: ['Active', 'Retired'] },
    { field: 'flag', header: 'Flag', kind: 'bool' },
    { field: 'html', header: 'Html', kind: 'custom', html: true, render: () => '<b>x</b>' },
    { field: 'hiddenOne', header: 'Hidden', kind: 'text', hidden: true },
  ];
  actions: GridAction<Row>[] = [
    { label: 'Edit', icon: 'pencil', run: () => undefined },
    { label: 'Only A', run: () => undefined, visible: (r) => r['name'] === 'A' },
  ];
}

describe('DataGridComponent', () => {
  let fixture: ComponentFixture<Host>;
  let requests: QueryRequest[];
  let rows: Row[];
  let total: number;
  const alerts = jasmine.createSpyObj<AlertService>('AlertService', ['success']);

  const last = () => requests[requests.length - 1];
  const grid = () => fixture.componentInstance.grid();

  beforeEach(() => {
    localStorage.clear();
    requests = [];
    rows = [{ name: 'A', qty: 2, price: 10.5, on: '2026-01-02T00:00:00Z', state: 'Active', flag: true }];
    total = 60;
    alerts.success.calls.reset();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AlertService, useValue: alerts },
        { provide: AuthService, useValue: { activeShopId: () => 7 } },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(APP_ICONS) },
      ],
    });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.source.set({
      query: (request) => {
        requests.push(request);
        return of({ items: rows, page: request.page, pageSize: request.pageSize, totalCount: total, totalPages: 3 });
      },
    });
    fixture.detectChanges();
  });

  const settle = () => {
    fixture.detectChanges();
    TestBed.tick();
  };

  it('AC:UI-05 first load sends paging, default sort and the active shop', () => {
    expect(last()).toEqual(jasmine.objectContaining({ page: 1, pageSize: 25, shopId: 7, search: null }));
    expect(last().sort).toEqual([{ field: 'name', desc: false }]);
  });

  it('AC:UI-05 renders rows, currency headers and html cells', () => {
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).toContain('10.50');
    expect(html).toContain('Price (PKR)');
    expect((fixture.nativeElement as HTMLElement).querySelector('td b')?.textContent).toBe('x');
  });

  it('AC:UI-05 hides columns marked hidden and offers them back', () => {
    expect(grid().visibleColumns().map((c) => c.field)).not.toContain('hiddenOne');
    grid().toggleColumn('hiddenOne');
    expect(grid().visibleColumns().map((c) => c.field)).toContain('hiddenOne');
    expect(JSON.parse(localStorage.getItem('techtill.grid.spec.prefs')!).hidden).toEqual([]);
  });

  it('AC:UI-05 never hides the last column', () => {
    grid().columns().forEach((c) => {
      if (!grid().hiddenCols().has(c.field)) grid().toggleColumn(c.field);
    });
    expect(grid().visibleColumns().length).toBe(1);
  });

  it('AC:UI-05 debounces global search and resets the page', fakeAsync(() => {
    grid().goTo(2);
    settle();
    grid().onSearch('  dell ');
    tick(300);
    settle();
    expect(last().search).toBe('dell');
    expect(last().page).toBe(1);
  }));

  it('AC:UI-07 maps each column filter kind to an API rule', () => {
    grid().setColFilter('name', 'lap', false);
    grid().setColFilter('qty', '>5', false);
    grid().setColFilter('state', 'Active', false);
    grid().setColFilter('flag', 'true', false);
    grid().setDateRange('on', 0, '2026-01-01');
    grid().setDateRange('on', 1, '2026-02-01');
    settle();

    expect(last().filters).toEqual([
      { field: 'name', operator: FilterOperator.Contains, value: 'lap', value2: null },
      { field: 'qty', operator: FilterOperator.GreaterThan, value: '5', value2: null },
      { field: 'state', operator: FilterOperator.Equals, value: 'Active', value2: null },
      { field: 'flag', operator: FilterOperator.Equals, value: 'true', value2: null },
      { field: 'on', operator: FilterOperator.Between, value: '2026-01-01', value2: '2026-02-01' },
    ]);
    expect(grid().dateRangePart('on', 1)).toBe('2026-02-01');
  });

  it('AC:UI-07 drops an unparseable number filter and clears a date range', () => {
    grid().setColFilter('qty', 'abc', false);
    grid().setDateRange('on', 0, '2026-01-01');
    grid().setDateRange('on', 0, '');
    settle();
    expect(last().filters).toEqual([]);
  });

  it('AC:UI-05 cycles sort desc, asc, then back to default', () => {
    const qty = grid().columns()[1];
    grid().sort(qty);
    settle();
    expect(last().sort[0]).toEqual({ field: 'qty', desc: true });
    grid().sort(qty);
    settle();
    expect(last().sort[0]).toEqual({ field: 'qty', desc: false });
    grid().sort(qty);
    settle();
    expect(last().sort[0]).toEqual({ field: 'name', desc: false });
  });

  it('AC:UI-05 builds the rule group with the chosen join', () => {
    grid().openFilters();
    grid().draftRules[0] = { field: 'name', operator: FilterOperator.Contains, value: 'x', value2: '' };
    grid().addRule();
    grid().draftRules[1] = { field: 'qty', operator: FilterOperator.Between, value: '1', value2: '2' };
    grid().draftLogic = 'or';
    grid().applyRules();
    settle();

    expect(last().filterGroup?.join).toBe(FilterJoin.Or);
    expect(last().filterGroup?.rules.length).toBe(2);
    expect(grid().describeRule(grid().rules()[1])).toBe('Qty between 1 and 2');
    expect(grid().activeFilterCount()).toBe(2);
  });

  it('AC:UI-05 drops incomplete rules and keeps valueless ones', () => {
    grid().openFilters();
    grid().draftRules = [
      { field: 'name', operator: FilterOperator.Contains, value: '', value2: '' },
      { field: 'name', operator: FilterOperator.IsEmpty, value: '', value2: '' },
    ];
    grid().applyRules();
    expect(grid().rules().length).toBe(1);
    expect(grid().needsValue(grid().rules()[0])).toBe(0);
  });

  it('AC:UI-05 resets operator and value when the field changes', () => {
    const rule = { field: 'qty', operator: FilterOperator.Between, value: '1', value2: '2' };
    grid().onRuleField(rule);
    expect(rule.operator).toBe(FilterOperator.Equals);
    expect(rule.value).toBe('');
    expect(grid().optionsFor('flag')).toEqual(['true', 'false']);
    expect(grid().optionsFor('state')).toEqual(['Active', 'Retired']);
    expect(grid().inputTypeFor('on')).toBe('date');
    expect(grid().inputTypeFor('qty')).toBe('number');
  });

  it('AC:UI-05 clearAll empties search, filters and rules', () => {
    grid().setColFilter('name', 'x', false);
    grid().rules.set([{ field: 'name', operator: FilterOperator.IsEmpty, value: '', value2: '' }]);
    grid().clearAll();
    settle();
    expect(last().filters).toEqual([]);
    expect(last().filterGroup).toBeNull();
    expect(grid().activeFilterCount()).toBe(0);
  });

  it('AC:UI-05 removes chips individually', () => {
    grid().setColFilter('name', 'x', false);
    grid().rules.set([{ field: 'name', operator: FilterOperator.IsEmpty, value: '', value2: '' }]);
    expect(grid().colFilterEntries().length).toBe(1);
    expect(grid().describeColFilter('name', 'x')).toBe('Name: x');
    grid().clearColFilter('name');
    grid().removeAppliedRule(0);
    expect(grid().activeFilterCount()).toBe(0);
  });

  it('AC:UI-05 paginates inside the range and remembers page size', () => {
    settle();
    expect(grid().pageCount()).toBe(3);
    grid().goTo(99);
    expect(grid().page()).toBe(1);
    grid().goTo(3);
    expect(grid().rangeFrom()).toBe(51);
    expect(grid().rangeTo()).toBe(60);
    grid().setPageSize(10);
    expect(grid().page()).toBe(1);
    expect(JSON.parse(localStorage.getItem('techtill.grid.spec.prefs')!).pageSize).toBe(10);
  });

  it('AC:UI-05 collapses long page lists with an ellipsis', () => {
    total = 1000;
    grid().reload();
    grid().goTo(20);
    expect(grid().pages()).toContain('…');
  });

  it('AC:UI-05 shows the error state when the query fails', () => {
    fixture.componentInstance.source.set({ query: () => throwError(() => new Error('boom')) });
    settle();
    expect(grid().loadFailed()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('That list could not load');
  });

  it('AC:UI-05 filters row actions by visibility and writes blank cells as a dash', () => {
    expect(grid().visibleActions({ name: 'A' }).length).toBe(2);
    expect(grid().visibleActions({ name: 'B' }).length).toBe(1);
    expect(grid().cellText({ name: null }, grid().columns()[0])).toBe('—');
    expect(grid().cellText({ flag: false }, grid().columns()[5])).toBe('No');
    expect(grid().cellText({ state: 'PettyCash' }, grid().columns()[4])).toBe('Petty cash');
    expect(grid().widthOf({ field: 'a', header: 'A', kind: 'text', width: 90 })).toBe('90px');
    expect(grid().widthOf(grid().columns()[0])).toBeNull();
  });

  it('AC:UI-05 CSV export pages through every filtered row', async () => {
    const pages: number[] = [];
    fixture.componentInstance.source.set({
      query: (request) => {
        pages.push(request.page);
        return of({ items: [{ name: '=evil', qty: 1, price: 2 }], page: request.page, pageSize: request.pageSize, totalCount: 2, totalPages: 2 });
      },
      export: () => of({ blob: new Blob(), filename: 'x.xlsx' }),
    });
    settle();
    pages.length = 0;
    const created: Blob[] = [];
    spyOn(URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => {
      created.push(b as Blob);
      return 'blob:x';
    });
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');

    await grid().export('csv');

    expect(pages).toEqual([1, 2]);
    const text = await created[0].text();
    expect(text).toContain(`"'=evil"`);
    expect(alerts.success).toHaveBeenCalled();
    expect(grid().exporting()).toBeNull();
  });

  it('AC:UI-05 Excel export sends the visible columns and only when offered', async () => {
    let sent: QueryRequest | undefined;
    fixture.componentInstance.source.set({
      query: () => of({ items: rows, page: 1, pageSize: 25, totalCount: 1, totalPages: 1 }),
      export: (request) => {
        sent = request;
        return of({ blob: new Blob(), filename: 'x.xlsx' });
      },
    });
    settle();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');

    expect(grid().exportable()).toBeTrue();
    await grid().export('xlsx');

    expect(sent?.columns).toContain('name');
    expect(sent?.columns).not.toContain('hiddenOne');
  });

  it('AC:UI-05 closes menus on an outside click', () => {
    grid().toggleMenu('columns', new Event('click'));
    expect(grid().menu()).toBe('columns');
    grid().onDocClick({ target: document.body } as unknown as Event);
    expect(grid().menu()).toBeNull();
  });
});
