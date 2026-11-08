// Builds a realistic disposable database: the demo seed, then a year of volume and 5,000 users.
// Run: node load-tests/setup.mjs
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { buildAll, startApi, stopApi, TEMPLATE, waitForHealth } from './lib.mjs';

const USERS = 5000;
const PRODUCTS = 5000;
const CUSTOMERS = 5000;
const INVOICES = 150_000;
const STOCK = 5_000_000;

buildAll();

for (const suffix of ['', '-wal', '-shm']) rmSync(TEMPLATE + suffix, { force: true });
const api = startApi({ database: TEMPLATE, environment: 'Development' });
await waitForHealth(api, 600_000);
await stopApi(api);

const db = new DatabaseSync(TEMPLATE);
db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=OFF; PRAGMA foreign_keys=ON;');

/** Clones a real row with overrides, so the script never has to know every column. */
function cloner(table, where = '1=1') {
  const sample = db.prepare(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`).get();
  if (!sample) throw new Error(`No sample row in ${table} for ${where}`);
  const columns = Object.keys(sample).filter((c) => c !== 'Id');
  const insert = db.prepare(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  );
  return { sample, add: (overrides) => insert.run(...columns.map((c) => (c in overrides ? overrides[c] : sample[c]))).lastInsertRowid };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');
const stamp = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.0000000`;
const pick = (list, i) => list[i % list.length];

// A fixed seed keeps the before and after runs on the same data.
let state = 20261109;
const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);

db.exec('BEGIN');

const shops = db.prepare('SELECT Id, Code FROM Shops ORDER BY Id').all();
const staff = db.prepare(`SELECT Id FROM Users WHERE Username='sara'`).get();
const user = cloner('Users', `Username='sara'`);
const userShop = cloner('UserShops', `UserId=${staff.Id}`);
const permission = cloner('UserPermissions', `UserId=${staff.Id}`);
for (let i = 1; i <= USERS; i++) {
  const id = user.add({ Username: `load${pad(i, 5)}`, FullName: `Load User ${i}` });
  userShop.add({ UserId: id, ShopId: pick(shops, i).Id });
  for (const module of ['Dashboard', 'Products', 'Stock', 'Pos', 'Invoices', 'Customers']) {
    const number = { Dashboard: 1, Products: 3, Stock: 4, Pos: 5, Invoices: 6, Customers: 7 }[module];
    const value = typeof permission.sample.Module === 'number' ? number : module;
    permission.add({ UserId: id, Module: value, CanRead: 1, CanWrite: 1 });
  }
}

const product = cloner('Products');
const words = ['Keyboard', 'Mouse', 'Monitor', 'SSD', 'Router', 'Laptop', 'Webcam', 'Headset', 'Printer', 'Cable'];
const brands = ['Dell', 'HP', 'Logitech', 'Samsung', 'TP-Link', 'Asus', 'Lenovo'];
for (let i = 1; i <= PRODUCTS; i++) {
  const salePrice = 500 + Math.floor(random() * 200_000);
  const id = product.add({ Sku: `LT-${pad(i, 5)}`, Name: `${pick(words, i)} ${pick(brands, i)} ${i}`, Brand: pick(brands, i), SalePrice: salePrice, CostPrice: Math.floor(salePrice * 0.7), ReorderLevel: 2, IsActive: 1, IsDeleted: 0 });
  void id;
}

const stockLevel = cloner('StockLevels');
const existing = new Set(db.prepare(`SELECT ShopId || ':' || ProductId k FROM StockLevels`).all().map((r) => r.k));
const productRows = db.prepare('SELECT Id, CostPrice, SalePrice FROM Products WHERE IsDeleted=0 AND IsActive=1').all();
for (const shop of shops) {
  for (const row of productRows) {
    if (!existing.has(`${shop.Id}:${row.Id}`)) stockLevel.add({ ShopId: shop.Id, ProductId: row.Id, Qty: STOCK });
  }
}
db.exec(`UPDATE StockLevels SET Qty=${STOCK}`);

const customer = cloner('Customers', 'IsWalkIn=0');
for (let i = 1; i <= CUSTOMERS; i++) customer.add({ Name: `Load Customer ${i}`, Phone: `03${pad(i, 9)}`, IsWalkIn: 0, IsDeleted: 0, IsActive: 1 });
const customers = db.prepare('SELECT Id FROM Customers WHERE IsWalkIn=0 AND IsDeleted=0').all();

const invoice = cloner('SalesInvoices', 'PaidAmount=Total AND Discount=0 AND VoidedAt IS NULL');
const item = cloner('SalesItems');
const payment = cloner('CustomerPayments');
const movement = cloner('StockMovements', `Reference LIKE '%-%'`);
const drawer = cloner('PettyCashEntries', 'IsSystemGenerated=1');
const sequence = new Map();
const now = Date.now();
for (let i = 1; i <= INVOICES; i++) {
  const shop = pick(shops, i);
  const at = new Date(now - Math.floor(random() * 365 * 86_400_000));
  const month = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}`;
  const key = `${shop.Code}-LT${month}`;
  const next = (sequence.get(key) ?? 0) + 1;
  sequence.set(key, next);
  const number = `${shop.Code}-${month}-L${pad(next, 6)}`;
  const lines = 1 + Math.floor(random() * 3);
  const chosen = Array.from({ length: lines }, () => productRows[Math.floor(random() * productRows.length)]);
  const total = chosen.reduce((sum, p) => sum + p.SalePrice, 0);
  const when = stamp(at);
  const customerId = customers[Math.floor(random() * customers.length)].Id;
  const id = invoice.add({ InvoiceNo: number, ShopId: shop.Id, CustomerId: customerId, InvoiceDate: when, SubTotal: total, Discount: 0, Total: total, PaidAmount: total, CreatedAt: when, Note: null });
  for (const p of chosen) {
    item.add({ SalesInvoiceId: id, ProductId: p.Id, Qty: 1, UnitPrice: p.SalePrice, UnitCost: p.CostPrice });
    movement.add({ ShopId: shop.Id, ProductId: p.Id, Qty: -1, UnitCost: p.CostPrice, MovedAt: when, Reference: number, CreatedAt: when });
  }
  payment.add({ ShopId: shop.Id, CustomerId: customerId, SalesInvoiceId: id, ReceivedAt: when, Amount: total, CreatedAt: when });
  if (i % 2 === 0) drawer.add({ ShopId: shop.Id, EntryDate: when, Amount: total, Note: `Cash sale ${number}`, CreatedAt: when });
}

db.exec('COMMIT');
db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_checkpoint(TRUNCATE);');
for (const table of ['Users', 'Products', 'StockLevels', 'Customers', 'SalesInvoices', 'SalesItems', 'CustomerPayments', 'StockMovements', 'PettyCashEntries']) {
  console.log(table.padEnd(18), db.prepare(`SELECT COUNT(*) n FROM "${table}"`).get().n);
}
db.close();
console.log('Template ready:', TEMPLATE);
