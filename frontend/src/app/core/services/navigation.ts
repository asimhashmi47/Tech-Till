import { ModuleName } from '../models/api.models';

/**
 * The sidebar, grouped as the spec lays out. Each item names the module it belongs to,
 * so one access check drives both the menu and the route guard.
 */
export type NavAccent =
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'cyan'
  | 'pink';

export interface NavItem {
  label: string;
  route: string;
  module: ModuleName;
  icon: string;

  /** Tints the item's hover and active states, so each area has its own colour. */
  accent: NavAccent;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Icons are inline SVG path data, drawn on a 24 unit grid. No icon font and no emoji,
// which keeps the strict font-src policy intact and the glyphs crisp at every size.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        route: '/dashboard',
        module: 'Dashboard',
        icon: 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z',
        accent: 'indigo',
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Point of sale',
        route: '/pos',
        module: 'Pos',
        icon: 'M3 6h18l-1.5 9H5.5L3 6Zm0 0L2 3H0m7 18a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm9 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z',
        accent: 'violet',
      },
      {
        label: 'Invoices',
        route: '/invoices',
        module: 'Invoices',
        icon: 'M6 2h9l5 5v15H6V2Zm9 0v5h5M9 13h8M9 17h5M9 9h3',
        accent: 'indigo',
      },
      {
        label: 'Customers',
        route: '/customers',
        module: 'Customers',
        icon: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 10a8 8 0 0 1 16 0',
        accent: 'cyan',
      },
      {
        label: 'Receipts',
        route: '/customers/receipts',
        module: 'Customers',
        icon: 'M4 4h16v13l-3-2-3 2-3-2-3 2V4Zm4 4h8M8 12h5',
        accent: 'emerald',
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        label: 'Products',
        route: '/products',
        module: 'Products',
        icon: 'M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10',
        accent: 'orange',
      },
      {
        label: 'Stock',
        route: '/stock',
        module: 'Stock',
        icon: 'M4 20V9l8-5 8 5v11H4Zm5 0v-7h6v7',
        accent: 'amber',
      },
      {
        label: 'Suppliers',
        route: '/suppliers',
        module: 'Suppliers',
        icon: 'M3 16V7h11v9H3Zm11-5h4l3 3v2h-7v-5ZM6 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Zm9 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z',
        accent: 'pink',
      },
      {
        label: 'Purchases',
        route: '/purchases',
        module: 'Purchases',
        icon: 'M5 4h14v16l-7-3-7 3V4Zm3 5h8M8 13h8',
        accent: 'violet',
      },
    ],
  },
  {
    label: 'Accounting',
    items: [
      {
        label: 'Expenses',
        route: '/expenses',
        module: 'Expenses',
        icon: 'M3 7h18v12H3V7Zm0 4h18M7 15h4',
        accent: 'rose',
      },
      {
        label: 'Petty cash',
        route: '/petty-cash',
        module: 'PettyCash',
        icon: 'M12 7v10M9 9.5h6M9 14.5h6M3 5h18v14H3V5Z',
        accent: 'emerald',
      },
      {
        label: 'Receivables',
        route: '/receivables',
        module: 'Customers',
        icon: 'M4 18V9m5 9V5m5 13v-7m5 7V7M3 21h18',
        accent: 'amber',
      },
      {
        label: 'Payables',
        route: '/payables',
        module: 'Suppliers',
        icon: 'M20 18V9m-5 9V5m-5 13v-7m-5 7V7M3 21h18',
        accent: 'orange',
      },
    ],
  },
  {
    label: 'Reports',
    items: [
      {
        label: 'Summary',
        route: '/reports/summary',
        module: 'Reports',
        icon: 'M4 4h16v16H4V4Zm4 12V9m4 7v-4m4 4v-8',
        accent: 'cyan',
      },
      {
        label: 'Profit and loss',
        route: '/reports/profit-and-loss',
        module: 'Reports',
        icon: 'M4 17l5-6 4 3 7-8M3 21h18',
        accent: 'emerald',
      },
      {
        label: 'Balance sheet',
        route: '/reports/balance-sheet',
        module: 'Reports',
        icon: 'M12 3v18M5 8h14M4 21h16M6 12h5m2 0h5',
        accent: 'indigo',
      },
      {
        label: 'Cash flow',
        route: '/reports/cash-flow',
        module: 'Reports',
        icon: 'M3 12h4l3-7 4 14 3-7h4',
        accent: 'violet',
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        label: 'Shops',
        route: '/shops',
        module: 'Shops',
        icon: 'M4 9h16v11H4V9Zm-1-5h18l-2 5H5L3 4Zm6 16v-6h6v6',
        accent: 'pink',
      },
      {
        label: 'Users',
        route: '/users',
        module: 'Users',
        icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M19 20a6 6 0 0 0-3-5',
        accent: 'cyan',
        adminOnly: true,
      },
      {
        label: 'Settings',
        route: '/settings',
        module: 'Settings',
        icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.1l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-1.9-1.1L14.7 3h-4l-.4 2.4a7.5 7.5 0 0 0-1.9 1.1l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 1.9 1.1l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5c.07-.36.1-.73.1-1.1Z',
        accent: 'indigo',
        adminOnly: true,
      },
      {
        label: 'Audit log',
        route: '/audit-log',
        module: 'AuditLog',
        icon: 'M7 3h10l3 3v15H4V6l3-3Zm1 8h8M8 15h8M8 7h4',
        accent: 'rose',
        adminOnly: true,
      },
    ],
  },
];
