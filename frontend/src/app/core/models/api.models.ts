// Typed mirror of the backend contracts. Nothing in the app uses `any`.

export type UserRole = 'Admin' | 'Standard';

export type ModuleName =
  | 'Dashboard'
  | 'Shops'
  | 'Products'
  | 'Stock'
  | 'Pos'
  | 'Invoices'
  | 'Customers'
  | 'Suppliers'
  | 'Purchases'
  | 'Expenses'
  | 'PettyCash'
  | 'Reports'
  | 'Users'
  | 'AuditLog'
  | 'Settings';

export type Access = 'Read' | 'Write';

export type PaymentMethod = 'Cash' | 'Card' | 'Bank' | 'Credit';
export type InvoiceStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Void';
export type PettyCashDirection = 'In' | 'Out';

export type StockMovementType =
  | 'Opening'
  | 'Purchase'
  | 'Sale'
  | 'AdjustmentIn'
  | 'AdjustmentOut'
  | 'TransferIn'
  | 'TransferOut'
  | 'SaleVoid';

export type AuditAction =
  | 'Create'
  | 'Update'
  | 'Delete'
  | 'Login'
  | 'LoginFailed'
  | 'Logout'
  | 'Void'
  | 'Export'
  | 'PermissionChange'
  | 'PasswordChange';

// ---------- Query contract (POST /api/{resource}/query) ----------

export enum FilterOperator {
  Contains = 1,
  Equals = 2,
  NotEquals = 3,
  StartsWith = 4,
  EndsWith = 5,
  GreaterThan = 6,
  GreaterThanOrEqual = 7,
  LessThan = 8,
  LessThanOrEqual = 9,
  Between = 10,
  In = 11,
  IsEmpty = 12,
  IsNotEmpty = 13,
}

export enum FilterJoin {
  And = 1,
  Or = 2,
}

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value?: string | null;
  value2?: string | null;
}

export interface FilterGroup {
  join: FilterJoin;
  rules: FilterRule[];
  groups: FilterGroup[];
}

export interface SortRule {
  field: string;
  desc: boolean;
}

export interface QueryRequest {
  page: number;
  pageSize: number;
  sort: SortRule[];
  filters: FilterRule[];
  filterGroup?: FilterGroup | null;
  search?: string | null;
  columns: string[];
  shopId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// ---------- Auth ----------

export interface ShopRef {
  id: number;
  code: string;
  name: string;
}

export interface ModulePermission {
  module: ModuleName;
  canRead: boolean;
  canWrite: boolean;
}

export interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  shops: ShopRef[];
  permissions: ModulePermission[];
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: UserProfile;
}

// ---------- Shops, products, stock ----------

export interface ShopDto {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface SaveShopRequest {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface CategoryDto {
  id: number;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface ProductDto {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  categoryName: string;
  brand?: string | null;
  costPrice: number;
  salePrice: number;
  reorderLevel: number;
  isActive: boolean;
  totalStock: number;
}

export interface SaveProductRequest {
  sku: string;
  name: string;
  categoryId: number;
  brand?: string | null;
  costPrice: number;
  salePrice: number;
  reorderLevel: number;
  isActive: boolean;
}

export interface PosProductDto {
  id: number;
  sku: string;
  name: string;
  categoryName: string;
  salePrice: number;
  qty: number;
}

export interface StockLevelDto {
  productId: number;
  sku: string;
  productName: string;
  categoryName: string;
  shopId: number;
  shopName: string;
  qty: number;
  reorderLevel: number;
  costPrice: number;
  stockValue: number;
  isLow: boolean;
}

export interface StockMovementDto {
  id: number;
  movedAt: string;
  shopId: number;
  shopName: string;
  sku: string;
  productName: string;
  type: StockMovementType;
  qty: number;
  unitCost: number;
  reference?: string | null;
  reason?: string | null;
  createdBy: string;
}

export interface AdjustStockRequest {
  shopId: number;
  productId: number;
  qty: number;
  reason: string;
}

export interface TransferStockRequest {
  fromShopId: number;
  toShopId: number;
  productId: number;
  qty: number;
  note?: string | null;
}

export interface OpeningStockRequest {
  shopId: number;
  productId: number;
  qty: number;
}

// ---------- Parties ----------

export interface SupplierDto {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  payable: number;
}

export interface SaveSupplierRequest {
  name: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
}

export interface CustomerDto {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  isWalkIn: boolean;
  isActive: boolean;
  receivable: number;
}

export interface SaveCustomerRequest {
  name: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
}

// ---------- Purchases ----------

export interface PurchaseBillListDto {
  id: number;
  billNo: string;
  billDate: string;
  shopId: number;
  shopName: string;
  supplierId: number;
  supplierName: string;
  total: number;
  paidAmount: number;
  outstanding: number;
  itemCount: number;
  createdBy: string;
}

export interface PurchaseItemDto {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseBillDetailDto {
  id: number;
  billNo: string;
  billDate: string;
  shopId: number;
  shopName: string;
  supplierId: number;
  supplierName: string;
  total: number;
  paidAmount: number;
  outstanding: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  items: PurchaseItemDto[];
}

export interface PurchaseLineInput {
  productId: number;
  qty: number;
  unitCost: number;
}

export interface CreatePurchaseRequest {
  shopId: number;
  supplierId: number;
  billDate: string;
  paidNow: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  items: PurchaseLineInput[];
}

export interface SupplierPaymentDto {
  id: number;
  paidAt: string;
  shopId: number;
  shopName: string;
  supplierId: number;
  supplierName: string;
  billNo?: string | null;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  createdBy: string;
}

export interface CreateSupplierPaymentRequest {
  shopId: number;
  supplierId: number;
  purchaseBillId?: number | null;
  paidAt: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
}

// ---------- Sales ----------

export interface InvoiceListDto {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  shopId: number;
  shopName: string;
  customerId: number;
  customerName: string;
  subTotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  outstanding: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  itemCount: number;
  createdBy: string;
}

export interface InvoiceItemDto {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceDetailDto {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  shopId: number;
  shopName: string;
  shopAddress?: string | null;
  shopPhone?: string | null;
  customerId: number;
  customerName: string;
  customerPhone?: string | null;
  subTotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  outstanding: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  note?: string | null;
  voidReason?: string | null;
  createdBy: string;
  items: InvoiceItemDto[];
}

export interface SaleLineInput {
  productId: number;
  qty: number;
  unitPrice: number;
}

export interface CreateSaleRequest {
  shopId: number;
  customerId: number;
  discount: number;
  paidNow: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  items: SaleLineInput[];
}

export interface CustomerPaymentDto {
  id: number;
  receivedAt: string;
  shopId: number;
  shopName: string;
  customerId: number;
  customerName: string;
  invoiceNo?: string | null;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  createdBy: string;
}

export interface CreateCustomerPaymentRequest {
  shopId: number;
  customerId: number;
  salesInvoiceId?: number | null;
  receivedAt: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
}

// ---------- Money ----------

export interface ExpenseCategoryDto {
  id: number;
  name: string;
  isActive: boolean;
}

export interface ExpenseDto {
  id: number;
  expenseDate: string;
  shopId: number;
  shopName: string;
  expenseCategoryId: number;
  categoryName: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  createdBy: string;
}

export interface SaveExpenseRequest {
  shopId: number;
  expenseCategoryId: number;
  expenseDate: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
}

export interface PettyCashEntryDto {
  id: number;
  entryDate: string;
  shopId: number;
  shopName: string;
  direction: PettyCashDirection;
  cashIn: number;
  cashOut: number;
  note?: string | null;
  fromExpense: boolean;
  createdBy: string;
}

export interface SavePettyCashRequest {
  shopId: number;
  entryDate: string;
  direction: PettyCashDirection;
  amount: number;
  note?: string | null;
}

export interface PettyCashDayDto {
  date: string;
  shopId: number;
  shopName: string;
  opening: number;
  cashIn: number;
  cashOut: number;
  closing: number;
}

// ---------- Ledgers and ageing ----------

export interface LedgerRowDto {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerDto {
  partyId: number;
  partyName: string;
  opening: number;
  closing: number;
  rows: LedgerRowDto[];
}

export interface AgeingRowDto {
  partyId: number;
  partyName: string;
  documentNo?: string | null;
  documentDate?: string | null;
  ageDays?: number | null;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
  total: number;
}

export interface AgeingSummaryDto {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
  total: number;
}

export interface AgeingResultDto {
  summary: AgeingSummaryDto;
  rows: PagedResult<AgeingRowDto>;
}

// ---------- Reports ----------

export interface SummaryRowDto {
  period: string;
  periodStart: string;
  invoiceCount: number;
  sales: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  receipts: number;
  purchases: number;
}

export interface NamedAmountDto {
  name: string;
  amount: number;
}

export interface ProfitAndLossDto {
  from: string;
  to: string;
  revenue: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  expenseLines: NamedAmountDto[];
  expenses: number;
  netProfit: number;
}

export interface BalanceSheetDto {
  asAt: string;
  cashAndBank: number;
  receivables: number;
  inventory: number;
  totalAssets: number;
  payables: number;
  totalLiabilities: number;
  ownerEquity: number;
}

export interface CashFlowDto {
  from: string;
  to: string;
  openingCash: number;
  customerReceipts: number;
  otherCashIn: number;
  totalInflow: number;
  supplierPayments: number;
  expensePayments: number;
  otherCashOut: number;
  totalOutflow: number;
  netCashFlow: number;
  closingCash: number;
}

// ---------- Dashboard ----------

export interface DashboardRangeDto {
  from: string;
  to: string;
  days: number;
  granularity: 'day' | 'month';
}

export interface KpiDto {
  todaySales: number;
  periodSales: number;
  grossProfit: number;
  expenses: number;
  receivables: number;
  payables: number;
  cashInHand: number;
  lowStockItems: number;
}

export interface SeriesPointDto {
  label: string;
  value: number;
}

export interface DualSeriesPointDto {
  label: string;
  first: number;
  second: number;
}

export interface DashboardDto {
  range: DashboardRangeDto;
  kpi: KpiDto;
  salesVsExpenses: DualSeriesPointDto[];
  dailySales: SeriesPointDto[];
  salesByCategory: SeriesPointDto[];
  topProducts: SeriesPointDto[];
  receivableAgeing: AgeingSummaryDto;
  shopSales: SeriesPointDto[];
  recentInvoices: InvoiceListDto[];
  lowStock: StockLevelDto[];
}

// ---------- Users and audit ----------

export interface UserListDto {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  shops: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface PermissionInput {
  module: ModuleName;
  canRead: boolean;
  canWrite: boolean;
}

export interface UserDetailDto {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  shopIds: number[];
  permissions: PermissionInput[];
}

export interface SaveUserRequest {
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  password?: string | null;
  shopIds: number[];
  permissions: PermissionInput[];
}

export interface AuditLogDto {
  id: number;
  at: string;
  username: string;
  shopName?: string | null;
  module: ModuleName;
  action: AuditAction;
  entity: string;
  entityId?: number | null;
  summary?: string | null;
  ip?: string | null;
  correlationId?: string | null;
}

// ---------- Errors ----------

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
}
