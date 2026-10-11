import { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard, moduleGuard } from './core/guards/access.guards';

/**
 * Every feature is lazy loaded, and every route carries the same module check the API
 * enforces. The shell wraps the signed in area so the sidebar is present on all pages.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in to TechTill',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        title: 'Dashboard',
        canActivate: [moduleGuard('Dashboard')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'pos',
        title: 'Point of sale',
        canActivate: [moduleGuard('Pos', true)],
        loadComponent: () => import('./features/pos/pos.component').then((m) => m.PosComponent),
      },
      {
        path: 'invoices',
        title: 'Invoices',
        canActivate: [moduleGuard('Invoices')],
        loadComponent: () =>
          import('./features/invoices/invoice-list.component').then((m) => m.InvoiceListComponent),
      },
      {
        path: 'invoices/:id',
        title: 'Invoice',
        canActivate: [moduleGuard('Invoices')],
        loadComponent: () =>
          import('./features/invoices/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
      },
      {
        path: 'products',
        title: 'Products',
        canActivate: [moduleGuard('Products')],
        loadComponent: () =>
          import('./features/products/product-list.component').then((m) => m.ProductListComponent),
      },
      {
        path: 'stock',
        title: 'Stock',
        canActivate: [moduleGuard('Stock')],
        loadComponent: () => import('./features/stock/stock.component').then((m) => m.StockComponent),
      },
      {
        path: 'suppliers',
        title: 'Suppliers',
        canActivate: [moduleGuard('Suppliers')],
        loadComponent: () =>
          import('./features/suppliers/supplier-list.component').then((m) => m.SupplierListComponent),
      },
      {
        path: 'suppliers/:id/ledger',
        title: 'Supplier ledger',
        canActivate: [moduleGuard('Suppliers')],
        loadComponent: () =>
          import('./features/suppliers/supplier-ledger.component').then((m) => m.SupplierLedgerComponent),
      },
      {
        path: 'purchases',
        title: 'Purchases',
        canActivate: [moduleGuard('Purchases')],
        loadComponent: () =>
          import('./features/purchases/purchase-list.component').then((m) => m.PurchaseListComponent),
      },
      {
        path: 'purchases/new',
        title: 'New purchase bill',
        canActivate: [moduleGuard('Purchases', true)],
        loadComponent: () =>
          import('./features/purchases/purchase-form.component').then((m) => m.PurchaseFormComponent),
      },
      {
        path: 'customers',
        title: 'Customers',
        canActivate: [moduleGuard('Customers')],
        loadComponent: () =>
          import('./features/customers/customer-list.component').then((m) => m.CustomerListComponent),
      },
      {
        path: 'customers/receipts',
        title: 'Customer receipts',
        canActivate: [moduleGuard('Customers')],
        loadComponent: () =>
          import('./features/customers/receipt-list.component').then((m) => m.ReceiptListComponent),
      },
      {
        path: 'customers/:id/ledger',
        title: 'Customer ledger',
        canActivate: [moduleGuard('Customers')],
        loadComponent: () =>
          import('./features/customers/customer-ledger.component').then((m) => m.CustomerLedgerComponent),
      },
      {
        path: 'expenses',
        title: 'Expenses',
        canActivate: [moduleGuard('Expenses')],
        loadComponent: () =>
          import('./features/expenses/expense-list.component').then((m) => m.ExpenseListComponent),
      },
      {
        path: 'petty-cash',
        title: 'Petty cash',
        canActivate: [moduleGuard('PettyCash')],
        loadComponent: () =>
          import('./features/petty-cash/petty-cash.component').then((m) => m.PettyCashComponent),
      },
      {
        path: 'receivables',
        title: 'Receivables ageing',
        canActivate: [moduleGuard('Customers')],
        loadComponent: () =>
          import('./features/reports/ageing.component').then((m) => m.AgeingComponent),
        data: { mode: 'receivable' },
      },
      {
        path: 'payables',
        title: 'Payables ageing',
        canActivate: [moduleGuard('Suppliers')],
        loadComponent: () =>
          import('./features/reports/ageing.component').then((m) => m.AgeingComponent),
        data: { mode: 'payable' },
      },
      {
        path: 'reports/summary',
        title: 'Daily and monthly summary',
        canActivate: [moduleGuard('Reports')],
        loadComponent: () =>
          import('./features/reports/summary.component').then((m) => m.SummaryComponent),
      },
      {
        path: 'reports/profit-and-loss',
        title: 'Profit and loss',
        canActivate: [moduleGuard('Reports')],
        loadComponent: () =>
          import('./features/reports/profit-and-loss.component').then((m) => m.ProfitAndLossComponent),
      },
      {
        path: 'reports/balance-sheet',
        title: 'Balance sheet',
        canActivate: [moduleGuard('Reports')],
        loadComponent: () =>
          import('./features/reports/balance-sheet.component').then((m) => m.BalanceSheetComponent),
      },
      {
        path: 'reports/cash-flow',
        title: 'Cash flow',
        canActivate: [moduleGuard('Reports')],
        loadComponent: () =>
          import('./features/reports/cash-flow.component').then((m) => m.CashFlowComponent),
      },
      {
        path: 'shops',
        title: 'Shops',
        canActivate: [moduleGuard('Shops')],
        loadComponent: () => import('./features/shops/shop-list.component').then((m) => m.ShopListComponent),
      },
      {
        path: 'users',
        title: 'Users and permissions',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/user-list.component').then((m) => m.UserListComponent),
      },
      {
        path: 'settings',
        title: 'Settings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'audit-log',
        title: 'Audit log',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/audit-log/audit-log.component').then((m) => m.AuditLogComponent),
      },
      {
        path: 'change-password',
        title: 'Change password',
        loadComponent: () =>
          import('./features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
      },

      // Used by the shop switcher to force a route to re-run.
      { path: 'blank', children: [] },
    ],
  },

  // The print view deliberately sits outside the shell so nothing but the invoice prints.
  {
    path: 'print/invoice/:id',
    canActivate: [authGuard, moduleGuard('Invoices')],
    title: 'Print invoice',
    loadComponent: () =>
      import('./features/invoices/invoice-print.component').then((m) => m.InvoicePrintComponent),
  },

  {
    path: 'error/:code',
    loadComponent: () => import('./features/errors/error-page.component').then((m) => m.ErrorPageComponent),
  },
  { path: '**', redirectTo: 'error/404' },
];
