import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { AuditLogDto, QueryRequest } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridColumn } from '../../shared/grid/grid.models';

type Row = AuditLogDto & Record<string, unknown>;

const ACTION_TONE: Record<string, string> = {
  Create: 'success',
  Update: 'info',
  Delete: 'unpaid',
  Void: 'unpaid',
  Login: 'neutral',
  LoginFailed: 'warning',
  Logout: 'neutral',
  Export: 'info',
  PermissionChange: 'warning',
  PasswordChange: 'warning',
};

/** Owner only. Every state change, sign in and export, with who, when and from where. */
@Component({
  selector: 'tt-audit-log',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  template: `
    <div class="tt-page">
      <header class="tt-page-head">
        <div class="tt-page-head__text">
          <h1 class="tt-page-head__title">Audit log</h1>
          <p class="tt-page-head__sub">
            Written by the server, not the browser, so it records what actually happened.
            Entries cannot be edited or removed.
          </p>
        </div>
      </header>

      <div class="tt-panel">
        <tt-data-grid
          gridKey="audit-log"
          [columns]="columns"
          [dataSource]="dataSource"
          [defaultSort]="[{ field: 'at', desc: true }]"
          searchPlaceholder="Search user, entity, summary or IP"
          emptyTitle="Nothing logged yet"
          emptyText="Actions appear here as soon as anyone uses the app."
          [useShopScope]="false"
        />
      </div>
    </div>
  `,
})
export class AuditLogComponent {
  private readonly api = inject(ApiService);

  readonly columns: GridColumn<Row>[] = [
    {
      field: 'at',
      header: 'When',
      kind: 'date',
      width: 165,
      render: (row) =>
        new Date(row.at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
    { field: 'username', header: 'User', kind: 'text', width: 130 },
    {
      field: 'action',
      header: 'Action',
      kind: 'enum',
      width: 150,
      options: [
        'Create',
        'Update',
        'Delete',
        'Login',
        'LoginFailed',
        'Logout',
        'Void',
        'Export',
        'PermissionChange',
        'PasswordChange',
      ],
      html: true,
      render: (row) =>
        `<span class="tt-chip tt-chip--${ACTION_TONE[row.action] ?? 'neutral'}">${row.action}</span>`,
    },
    {
      field: 'module',
      header: 'Module',
      kind: 'enum',
      width: 130,
      options: [
        'Dashboard',
        'Shops',
        'Products',
        'Stock',
        'Pos',
        'Invoices',
        'Customers',
        'Suppliers',
        'Purchases',
        'Expenses',
        'PettyCash',
        'Reports',
        'Users',
        'AuditLog',
      ],
    },
    { field: 'entity', header: 'Entity', kind: 'text', width: 140 },
    { field: 'entityId', header: 'Id', kind: 'number', width: 80, hidden: true },
    { field: 'shopName', header: 'Shop', kind: 'text', width: 150 },
    { field: 'summary', header: 'Summary', kind: 'text', flex: 2, minWidth: 220 },
    { field: 'ip', header: 'IP', kind: 'text', width: 130, hidden: true },
    { field: 'correlationId', header: 'Correlation id', kind: 'text', width: 180, hidden: true },
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('audit-log', request),
    export: (request: QueryRequest) => this.api.export('audit-log', request),
  };
}
