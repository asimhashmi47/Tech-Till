import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ModuleName,
  PermissionInput,
  QueryRequest,
  SaveUserRequest,
  UserDetailDto,
  UserListDto,
  UserRole,
} from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DataGridComponent, GridDataSource } from '../../shared/grid/data-grid.component';
import { GridAction, GridColumn } from '../../shared/grid/grid.models';
import { DrawerComponent } from '../../shared/ui/drawer.component';

type Row = UserListDto & Record<string, unknown>;

/** The modules a standard user can be given access to, in sidebar order. */
const ASSIGNABLE: { module: ModuleName; label: string }[] = [
  { module: 'Dashboard', label: 'Dashboard' },
  { module: 'Pos', label: 'Point of sale' },
  { module: 'Invoices', label: 'Invoices' },
  { module: 'Customers', label: 'Customers' },
  { module: 'Products', label: 'Products' },
  { module: 'Stock', label: 'Stock' },
  { module: 'Suppliers', label: 'Suppliers' },
  { module: 'Purchases', label: 'Purchases' },
  { module: 'Expenses', label: 'Expenses' },
  { module: 'PettyCash', label: 'Petty cash' },
  { module: 'Reports', label: 'Reports' },
  { module: 'Shops', label: 'Shops' },
];

@Component({
  selector: 'tt-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, DrawerComponent],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  private readonly grid = viewChild<DataGridComponent<Row>>('grid');

  readonly assignable = ASSIGNABLE;
  readonly shops = this.auth.shops;

  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly loadingDetail = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly errors = signal<Record<string, string>>({});

  readonly username = signal('');
  readonly fullName = signal('');
  readonly role = signal<UserRole>('Standard');
  readonly isActive = signal(true);
  readonly password = signal('');
  readonly shopIds = signal<number[]>([]);
  readonly matrix = signal<Record<string, { read: boolean; write: boolean }>>({});

  readonly isAdminRole = computed(() => this.role() === 'Admin');

  readonly grantedCount = computed(
    () => Object.values(this.matrix()).filter((entry) => entry.read || entry.write).length,
  );

  readonly columns: GridColumn<Row>[] = [
    { field: 'username', header: 'Username', kind: 'text', width: 140 },
    { field: 'fullName', header: 'Name', kind: 'text', flex: 2, minWidth: 170 },
    {
      field: 'role',
      header: 'Role',
      kind: 'enum',
      width: 110,
      options: ['Admin', 'Standard'],
      html: true,
      render: (row) =>
        row.role === 'Admin'
          ? '<span class="tt-chip tt-chip--info">Owner</span>'
          : '<span class="tt-chip tt-chip--neutral">Staff</span>',
    },
    { field: 'shops', header: 'Shops', kind: 'text', flex: 2, minWidth: 180 },
    {
      field: 'lastLoginAt',
      header: 'Last signed in',
      kind: 'date',
      width: 150,
      render: (row) =>
        row.lastLoginAt
          ? new Date(row.lastLoginAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'Never',
    },
    {
      field: 'isActive',
      header: 'Status',
      kind: 'bool',
      width: 110,
      html: true,
      render: (row) =>
        row.isActive
          ? '<span class="tt-chip tt-chip--success">Active</span>'
          : '<span class="tt-chip tt-chip--void">Disabled</span>',
    },
  ];

  readonly actions: GridAction<Row>[] = [
    {
      label: 'Edit user and permissions',
      icon: 'M4 20h4l10-10-4-4L4 16v4Z',
      run: (row) => this.edit(row.id),
    },
    {
      label: 'Disable user',
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-5 5 10 10',
      kind: 'danger',
      run: (row) => void this.deactivate(row),
      visible: (row) => row.role !== 'Admin' && row.isActive,
    },
  ];

  readonly dataSource: GridDataSource<Row> = {
    query: (request: QueryRequest) => this.api.query<Row>('users', request),
    export: (request: QueryRequest) => this.api.export('users', request),
  };

  create(): void {
    this.editingId.set(null);
    this.errors.set({});
    this.username.set('');
    this.fullName.set('');
    this.role.set('Standard');
    this.isActive.set(true);
    this.password.set('');
    this.shopIds.set([]);
    this.matrix.set(this.blankMatrix());
    this.drawerOpen.set(true);
  }

  edit(id: number): void {
    this.editingId.set(id);
    this.errors.set({});
    this.password.set('');
    this.loadingDetail.set(true);
    this.drawerOpen.set(true);

    this.api.get<UserDetailDto>(`users/${id}`).subscribe({
      next: (user) => {
        this.username.set(user.username);
        this.fullName.set(user.fullName);
        this.role.set(user.role);
        this.isActive.set(user.isActive);
        this.shopIds.set([...user.shopIds]);

        const next = this.blankMatrix();
        for (const permission of user.permissions) {
          if (next[permission.module]) {
            next[permission.module] = {
              read: permission.canRead || permission.canWrite,
              write: permission.canWrite,
            };
          }
        }

        this.matrix.set(next);
        this.loadingDetail.set(false);
      },
      error: () => {
        this.loadingDetail.set(false);
        this.drawerOpen.set(false);
      },
    });
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  toggleShop(shopId: number, selected: boolean): void {
    this.shopIds.update((ids) =>
      selected ? [...new Set([...ids, shopId])] : ids.filter((id) => id !== shopId),
    );
  }

  hasShop(shopId: number): boolean {
    return this.shopIds().includes(shopId);
  }

  /** Write implies read, so ticking write ticks read and clearing read clears write. */
  setAccess(module: ModuleName, kind: 'read' | 'write', value: boolean): void {
    this.matrix.update((current) => {
      const entry = current[module] ?? { read: false, write: false };

      const next =
        kind === 'write'
          ? { read: value ? true : entry.read, write: value }
          : { read: value, write: value ? entry.write : false };

      return { ...current, [module]: next };
    });
  }

  access(module: ModuleName): { read: boolean; write: boolean } {
    return this.matrix()[module] ?? { read: false, write: false };
  }

  grantAll(write: boolean): void {
    const next = this.blankMatrix();
    for (const row of ASSIGNABLE) {
      next[row.module] = { read: true, write };
    }

    this.matrix.set(next);
  }

  clearAll(): void {
    this.matrix.set(this.blankMatrix());
  }

  save(): void {
    const found: Record<string, string> = {};
    const username = this.username().trim();
    const fullName = this.fullName().trim();
    const password = this.password();

    if (!username) {
      found['username'] = 'A username is required.';
    }

    if (!fullName) {
      found['fullName'] = 'A full name is required.';
    }

    if (!this.editingId() && password.length < 8) {
      found['password'] = 'Set a password of at least 8 characters.';
    }

    if (this.editingId() && password.length > 0 && password.length < 8) {
      found['password'] = 'Use at least 8 characters, or leave it blank to keep the current one.';
    }

    if (this.role() === 'Standard' && this.shopIds().length === 0) {
      found['shops'] = 'Assign at least one shop, otherwise this account sees nothing.';
    }

    this.errors.set(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    const permissions: PermissionInput[] = ASSIGNABLE.map((row) => ({
      module: row.module,
      canRead: this.access(row.module).read,
      canWrite: this.access(row.module).write,
    })).filter((entry) => entry.canRead || entry.canWrite);

    const body: SaveUserRequest = {
      username,
      fullName,
      role: this.role(),
      isActive: this.isActive(),
      password: password.length > 0 ? password : null,
      shopIds: this.shopIds(),
      permissions,
    };

    this.saving.set(true);
    const id = this.editingId();
    const request = id
      ? this.api.put<UserDetailDto>(`users/${id}`, body)
      : this.api.post<UserDetailDto>('users', body);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.alerts.success(
          id ? 'User updated' : 'User created',
          `${saved.fullName} takes effect on their next request`,
        );
        this.grid()?.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  private blankMatrix(): Record<string, { read: boolean; write: boolean }> {
    const result: Record<string, { read: boolean; write: boolean }> = {};
    for (const row of ASSIGNABLE) {
      result[row.module] = { read: false, write: false };
    }

    return result;
  }

  private async deactivate(row: UserListDto): Promise<void> {
    const confirmed = await this.alerts.confirm({
      title: `Disable ${row.fullName}?`,
      message: 'They are signed out everywhere and cannot sign in again until re-enabled.',
      confirmLabel: 'Disable account',
    });

    if (!confirmed) {
      return;
    }

    this.api.delete<void>(`users/${row.id}`).subscribe({
      next: () => {
        this.alerts.success('Account disabled', row.username);
        this.grid()?.refresh();
      },
    });
  }
}
