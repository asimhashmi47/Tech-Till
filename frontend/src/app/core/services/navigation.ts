import { ModuleName } from '../models/api.models';

/**
 * The sidebar. Each item names the module it belongs to, so one access check drives both
 * the menu and the route guard. Icons are lucide names, registered in core/icons.ts.
 */
export interface NavItem {
  label: string;
  route: string;
  module: ModuleName;
  icon: string;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', route: '/dashboard', module: 'Dashboard', icon: 'layout-dashboard' }],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Point of sale', route: '/pos', module: 'Pos', icon: 'shopping-cart' },
      { label: 'Invoices', route: '/invoices', module: 'Invoices', icon: 'file-text' },
      { label: 'Customers', route: '/customers', module: 'Customers', icon: 'contact' },
      { label: 'Receipts', route: '/customers/receipts', module: 'Customers', icon: 'receipt' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Products', route: '/products', module: 'Products', icon: 'package' },
      { label: 'Stock', route: '/stock', module: 'Stock', icon: 'warehouse' },
      { label: 'Suppliers', route: '/suppliers', module: 'Suppliers', icon: 'truck' },
      { label: 'Purchases', route: '/purchases', module: 'Purchases', icon: 'clipboard-list' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Expenses', route: '/expenses', module: 'Expenses', icon: 'wallet' },
      { label: 'Petty cash', route: '/petty-cash', module: 'PettyCash', icon: 'coins' },
      { label: 'Receivables', route: '/receivables', module: 'Customers', icon: 'hand-coins' },
      { label: 'Payables', route: '/payables', module: 'Suppliers', icon: 'banknote' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Summary', route: '/reports/summary', module: 'Reports', icon: 'chart-column' },
      { label: 'Profit and loss', route: '/reports/profit-and-loss', module: 'Reports', icon: 'trending-up' },
      { label: 'Balance sheet', route: '/reports/balance-sheet', module: 'Reports', icon: 'scale' },
      { label: 'Cash flow', route: '/reports/cash-flow', module: 'Reports', icon: 'activity' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Shops', route: '/shops', module: 'Shops', icon: 'store' },
      { label: 'Users', route: '/users', module: 'Users', icon: 'users', adminOnly: true },
      { label: 'Settings', route: '/settings', module: 'Settings', icon: 'settings', adminOnly: true },
      { label: 'Audit log', route: '/audit-log', module: 'AuditLog', icon: 'scroll-text', adminOnly: true },
    ],
  },
];
