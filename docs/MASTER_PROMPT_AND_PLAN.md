# TechTill - Master Prompt and Build Plan

**Product name:** TechTill
**Tagline:** Inventory, POS and books for computer shops.
**Type:** MVP, multi-shop, single owner, standard (not feature heavy)

---

## 0. How to use this file

| Phase | Goal | Model | Effort |
|-------|------|-------|--------|
| 1 | UI/UX design system and screen specs | Claude Opus 5.5 | High |
| 2 | Backend + frontend development | Claude Sonnet 5.5 | Standard |
| 3 | Full QA (functional, security, UI, accounting) | Claude Opus 5.5 | High |
| 4 | README, GitHub packaging | Claude Sonnet 5.5 | Standard |

Run phases in order. Each phase has its own prompt in Section 12. Section 1 to 11 is the shared spec that every phase must read first. Do not add features that are not listed here.

---

## 1. Product summary

TechTill is a small SaaS-style web app for an owner who runs multiple computer shops (computers, laptops, accessories). It combines three things only:

1. Inventory (products and stock per shop)
2. POS and invoicing (sales, payments, returns kept out of scope)
3. Small accounting (expenses, petty cash, customer ledger, supplier payable, receivables, ageing, P&L, balance sheet, cash flow)

Everything is scoped by **Shop**. One owner (Admin) sees all shops. Staff see only the shops assigned to them.

---

## 2. Tech stack (fixed)

| Layer | Choice |
|-------|--------|
| Backend | ASP.NET Core 8 Web API, Clean Architecture |
| ORM / DB | EF Core + SQLite (single file, migrations included) |
| Frontend | Angular 18+ (standalone components, signals, SCSS) |
| Alerts | SweetAlert2 (toast position `top-end`, confirm dialogs) |
| Progress | Top slim progress bar driven by an HTTP interceptor |
| Cache | `IMemoryCache` (dashboard, lookups, permissions) |
| Grid | AG Grid Community (server-side query) |
| Charts | Chart.js via ng2-charts |
| Excel | ClosedXML on the backend (export current filtered query) |
| Auth | JWT (access token) + refresh token, BCrypt password hashing |
| Logging | Serilog (file + DB audit table) |
| Docs | Swagger in Development only |

### Security and headers

- CSP header set by middleware. Inline allowed only where required:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'`
- Also: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS in production.
- CORS restricted to the Angular origin.
- Rate limit on login endpoint (simple fixed window).
- Fonts and icons are bundled locally (no external CDN), so CSP stays strict.

---

## 3. Repository layout

```
techtill/
  README.md
  .gitignore
  docs/
    MASTER_PROMPT_AND_PLAN.md
    ui-design/            (design tokens, screen specs, wireframes)
    qa-report.md
  backend/
    TechTill.sln
    src/
      TechTill.Domain/            (entities, enums, value objects, no dependencies)
      TechTill.Application/       (use cases, DTOs, interfaces, validators, query spec)
      TechTill.Infrastructure/    (EF Core, SQLite, repos, services, Serilog, Excel)
      TechTill.Api/               (controllers, middleware, auth, CSP, error handling)
    tests/
      TechTill.UnitTests/
      TechTill.IntegrationTests/
  frontend/
    angular.json
    src/app/
      core/        (auth, interceptors, guards, error pages, services)
      shared/      (grid wrapper, cards, charts, layout, pipes)
      features/
        auth/ dashboard/ shops/ products/ stock/ pos/ invoices/
        customers/ suppliers/ purchases/ expenses/ petty-cash/
        reports/ users/ audit-log/
```

Dependency rule: Domain <- Application <- Infrastructure <- Api. Controllers contain no business logic.

---

## 4. Scope (MVP only)

### In scope

1. **Auth and users:** login, logout, change password. Admin creates users, assigns role and per-module read/write access, and assigns shops.
2. **Shops:** create/edit shops (name, address, phone, active flag).
3. **Products:** categories (Computer, Laptop, Accessory, custom), product CRUD (SKU, name, category, brand, cost price, sale price, reorder level, active).
4. **Stock:** per-shop stock levels, opening stock, purchase receipts increase stock, sales decrease stock, manual adjustment with reason, stock transfer between shops (simple, one step).
5. **Suppliers and purchases:** supplier CRUD, purchase bill (items, total, paid now, remaining becomes payable), supplier payment.
6. **Customers:** customer CRUD, walk-in customer default, credit sales allowed, customer payment receipt.
7. **POS:** fast product search/barcode field, cart, discount (amount), payment (cash, card, bank, credit/partial), complete sale creates invoice and stock movement.
8. **Invoices:** list, view, print (A4 and 80mm thermal friendly CSS), status Paid / Partial / Unpaid / Void (void by Admin only, reverses stock and ledger).
9. **Expenses:** category, amount, date, shop, payment method, note.
10. **Petty cash:** per-shop cash drawer. Cash in, cash out (linked to expense optional), daily opening/closing balance.
11. **Ledgers:** customer ledger, supplier ledger (date, ref, debit, credit, running balance).
12. **Receivables and payables:** current balances plus **ageing** (Current, 1-30, 31-60, 61-90, 90+), both **customer-wise** and **invoice-wise** (same for suppliers and bills). Payment history lists for both.
13. **Reports:** Daily and Monthly summary, Profit and Loss, Balance Sheet (simple), Cash Flow (simple, direct method). All filterable by shop (or all shops) and date range. Export to Excel.
14. **Dashboard:** KPI cards and charts (see Section 9).
15. **Audit log:** every create/update/delete/login/void/export is logged (who, when, shop, module, action, entity id, old/new summary, IP).
16. **Error pages:** 400, 401, 403, 404, 500, offline/network error.

### Out of scope (do not build)

Returns/credit notes, tax engines, multi-currency, warranties/serials, barcode label printing, email/SMS, payroll, bank reconciliation, multi-tenant (many owners), mobile app, import from Excel, approvals/workflows.

---

## 5. Roles and permissions

Seed data: **1 Admin** and **5 Standard users** (demo accounts, passwords documented in README for local use only).

- **Admin:** full rights, all shops, manages users and permissions, can void invoices, can view audit log.
- **Standard user:** access defined per module by Admin:

| Module | Read | Write |
|--------|------|-------|
| Dashboard, Shops, Products, Stock, POS, Invoices, Customers, Suppliers, Purchases, Expenses, Petty Cash, Reports | checkbox | checkbox |

Rules:
- `Write` implies `Read`.
- Enforced on **backend** with a policy attribute `[RequirePermission(Module.X, Access.Write)]` and on **frontend** by hiding menu items, buttons and routes (guards).
- Permissions cached in `IMemoryCache` per user, invalidated when Admin changes them.
- Standard users only see data for assigned shops (enforced in query layer, not only UI).
- Users and Audit Log modules are Admin only.

---

## 6. Domain model (core entities)

`Shop, AppUser, UserShop, UserPermission, Category, Product, StockLevel(ShopId, ProductId, Qty), StockMovement(type, ref), Supplier, Customer, PurchaseBill, PurchaseItem, SupplierPayment, SalesInvoice, SalesItem, CustomerPayment, ExpenseCategory, Expense, PettyCashEntry, AuditLog, RefreshToken`

Conventions: `Id` (long), `CreatedAt/By`, `UpdatedAt/By`, soft delete flag where history matters, money as `decimal(18,2)` stored as TEXT/REAL safely in SQLite (use a value converter), all dates UTC, display in shop local time.

---

## 7. Accounting rules (keep simple and consistent)

Use a **transaction-derived** approach. No manual journal entries in the UI. Reports are computed from the operational tables.

- **Sale:** Revenue = invoice total. COGS = sum(qty x product cost at time of sale; store cost on SalesItem). Receivable = total - paid.
- **Purchase:** Inventory value up by bill total. Payable = total - paid.
- **Expense:** reduces profit on its date. If paid in cash from drawer, creates petty cash out entry.
- **Customer payment:** reduces receivable, increases cash/bank by method.
- **Supplier payment:** reduces payable, decreases cash/bank by method.
- **Ledger running balance:** customer balance = invoices - payments. Supplier balance = bills - payments.
- **Ageing:** based on invoice/bill date (no due-date field in MVP). Payments are allocated oldest-first for customer-wise view; invoice-wise view shows each open invoice with its age bucket.
- **P&L:** Revenue - COGS = Gross Profit; minus Expenses = Net Profit.
- **Balance Sheet (as at date):**
  Assets = Cash and Bank (computed from receipts/payments/petty cash) + Receivables + Inventory (qty x cost).
  Liabilities = Payables.
  Equity = Assets - Liabilities (shown as Owner Equity incl. current profit).
- **Cash Flow:** Operating inflows (cash sales, customer receipts) minus outflows (supplier payments, expenses). Opening and closing cash shown.

Add automated tests that prove: Assets = Liabilities + Equity, P&L ties to invoices/expenses, ageing totals equal ledger balances.

---

## 8. Advanced table spec (applies to every list)

Use one reusable `<tt-data-grid>` component backed by a generic server-side query endpoint.

- Column sorting (multi-column with shift-click)
- Column-wise search (floating filter row) with type-aware operators (contains, equals, starts with, greater/less, between, date range)
- Global quick search
- Multi-column select: column chooser to show/hide columns (saved per user per grid in localStorage)
- Advanced filter builder (AND/OR groups, simple UI) that produces a query object
- Pagination (server-side), page size 10/25/50/100
- Row actions menu, row selection
- **Download Excel** button: exports the current filter + sort + visible columns (server-side via ClosedXML, respects permissions and shop scope)
- Empty state, loading skeleton, error state
- Backend: `POST /api/{resource}/query` with `{ page, pageSize, sort[], filters[], columns[], search }`. Whitelist sortable/filterable fields per resource to prevent injection. Use parameterized LINQ only.

---

## 9. Dashboard spec

Light theme, multi-color cards, each card its own accent color and icon. Shop switcher at top (All shops or one).

**KPI cards (8):** Today Sales (indigo), Month Sales (violet), Gross Profit (emerald), Expenses (rose), Receivables (amber), Payables (orange), Cash in Hand (cyan), Low Stock Items (pink).

**Charts (each a different type and palette):**
1. Sales vs Expenses last 12 months (grouped bar, indigo/rose)
2. Daily sales last 30 days (smooth area line, violet gradient)
3. Sales by category (doughnut, multi-color)
4. Top 5 products (horizontal bar, emerald scale)
5. Receivable ageing (stacked bar, amber to red)
6. Shop-wise sales comparison (radar or polar area, teal/blue)

Plus: recent invoices table and low stock list. Data cached 60 seconds in `IMemoryCache` with explicit invalidation on sale/purchase/expense.

---

## 10. UI and UX design requirements (SaaS level)

- **Theme:** light only. Clean white surfaces, soft gray app background (`#F6F7FB`), subtle shadows, 12 to 16px radius, generous spacing.
- **Layout:** fixed left **sidebar on every page** (collapsible, grouped sections: Overview, Sales, Inventory, Accounting, Reports, Admin), top bar with shop switcher, global search, notifications icon, user menu.
- **Color system:** neutral base plus a multi-color accent palette (indigo, violet, emerald, amber, rose, cyan, orange, pink). Define as CSS variables / SCSS tokens. Status chips: Paid=emerald, Partial=amber, Unpaid=rose, Void=slate.
- **Typography:** Inter (bundled locally). Clear scale for H1-H4, body, caption, numeric (tabular nums for money).
- **Components to design:** sidebar, top bar, KPI card, chart card, data grid, filter builder, form fields, modals/drawers, tabs, badges, buttons (primary, soft, ghost, danger), empty states, skeletons, toasts (SweetAlert2 top-end), confirm dialogs, top progress bar, error pages, login page, POS screen, printable invoice.
- **POS screen:** two-panel layout. Left: product search, category chips, product tiles. Right: cart, customer picker, discount, payment method, totals, big Pay button. Keyboard friendly (F2 search, F9 pay).
- **Accessibility:** WCAG AA contrast, visible focus, labels, keyboard navigation.
- **Responsive:** desktop first, usable on tablet. Sidebar collapses on small screens.
- **Feedback rules:** progress bar on every HTTP call, success toast on save, confirm dialog before delete/void, inline field validation, friendly error messages.

Deliverables for the design phase are listed in Phase 1 below.

---

## 11. Cross-cutting requirements

### Logging and audit
- Serilog rolling file logs (`/logs`), request logging with correlation id.
- `AuditLog` table written by a single `IAuditService` for every state-changing action, login success/failure, export, permission change.
- Admin screen: audit log grid (uses the same advanced grid).

### Error handling
- Global exception middleware returns RFC 7807 `ProblemDetails` with correlation id. No stack traces in production.
- Angular `HttpErrorInterceptor` maps: 400 (show validation messages), 401 (try refresh, else login), 403 (forbidden page), 404 (not found page), 500 (server error page), 0 (offline page). Toast for non-navigational errors.
- Routes: `/error/400`, `/error/401`, `/error/403`, `/error/404`, `/error/500`, `/error/offline`, wildcard to 404.

### Performance and data
- `IMemoryCache` for: permissions, categories, shops, dashboard aggregates, low stock count.
- Indexes on SKU, invoice number, dates, foreign keys.
- Invoice numbers per shop: `SHOPCODE-YYYYMM-0001`.
- Seed: 2 shops, categories, 25 sample products, 3 suppliers, 5 customers, sample sales/purchases/expenses so every chart has data on first run.

### Code quality
- Nullable enabled, analyzers on, FluentValidation for commands, no business logic in controllers, async everywhere, consistent naming.
- Angular strict mode, lazy-loaded feature routes, typed API clients, no `any`.

---

## 12. Phase prompts (copy and paste)

### 12.0 Shared preamble (prepend to every phase prompt)

```
You are working on TechTill, a small multi-shop MVP for a computer shop owner
(inventory + POS + small accounting). The full specification is in
docs/MASTER_PROMPT_AND_PLAN.md, Sections 1 to 11. Read it fully before doing anything.
Rules: stay inside the MVP scope, do not add features, keep the project small,
keep Clean Architecture, light theme only, sidebar on all pages.
Never use em dashes in any text, code comments or documentation. Use hyphens.
Report progress as a short checklist, not a narrative.
```

### 12.1 Phase 1 - UI design (Claude Opus 5.5, high effort)

```
[Shared preamble]

ROLE: Principal product designer for B2B SaaS.
TASK: Design the complete UI system and every screen of TechTill before any code exists.

Produce in docs/ui-design/:
1. design-tokens.scss and tokens.md (colors incl. 8 accent colors with soft/solid/text
   variants, neutrals, spacing, radius, shadows, typography, z-index, motion).
2. component-spec.md: sidebar, top bar, KPI card, chart card, data grid (with column
   search row, column chooser, filter builder, export button), forms, drawer, modal,
   chips, buttons, empty/loading/error states, SweetAlert2 toast and confirm styling,
   top progress bar.
3. screens/*.html: standalone static HTML+CSS mockups (no frameworks, local fonts only)
   for: Login, Dashboard, POS, Invoice list, Invoice print, Product list, Product form,
   Stock, Purchase bill, Customer ledger, Supplier ledger, Receivables ageing
   (customer-wise and invoice-wise), Payables ageing, Expenses, Petty cash,
   Reports (P&L, Balance Sheet, Cash Flow, Daily/Monthly), Users and permissions matrix,
   Audit log, and all error pages (400/401/403/404/500/offline).
4. navigation-map.md: sidebar groups, routes, which role sees what.
5. design-review.md: self-critique against SaaS quality (hierarchy, density, contrast,
   consistency, empty states). Fix issues before finishing.

Constraints: light theme, multi-color dashboard cards and 6 different chart types as
in Section 9, premium look comparable to Stripe/Linear/Vercel dashboards,
easy for non-technical shop staff, keyboard friendly POS.
Done when: every screen listed exists, tokens are consistent, and a developer can
build the Angular UI without asking design questions.
```

### 12.2 Phase 2 - Development (Claude Sonnet 5.5)

Run as 6 sequential sub-prompts. Commit after each.

```
[Shared preamble]

ROLE: Senior .NET and Angular engineer. Follow docs/ui-design/ exactly for the UI.

STEP A - Backend foundation
Create the solution in backend/ with 4 projects + tests (Section 3). Implement Domain
entities, EF Core DbContext, SQLite migrations, seed data, JWT auth with refresh tokens,
permission policy attribute, global exception middleware (ProblemDetails), CSP and
security headers middleware, Serilog, IAuditService, IMemoryCache wrappers, generic
query spec (page/sort/filters/columns/search with whitelisting) and Excel export service.

STEP B - Backend modules
Shops, Users and permissions, Categories, Products, Stock (adjust, transfer),
Suppliers, Purchases, Supplier payments, Customers, Customer payments, POS sale
and invoices (void), Expenses, Petty cash. Each with Application use cases, validators,
controllers and /query + /export endpoints.

STEP C - Accounting and reports API
Ledgers, receivable and payable balances, ageing (customer-wise and invoice-wise),
payment history, daily/monthly summary, P&L, Balance Sheet, Cash Flow, dashboard
aggregates (cached). Add unit tests proving the accounting identities in Section 7.

STEP D - Frontend foundation
Angular app in frontend/: tokens from the design phase, app shell with sidebar on every
page, auth, guards, interceptors (JWT, progress bar, error mapping), SweetAlert2 service
(toast top-end, confirm), error pages and routes, reusable <tt-data-grid>, KPI card
and chart card components.

STEP E - Frontend features
Build all feature modules from the navigation map: dashboard, POS, invoices (with print
view), products, stock, purchases, suppliers, customers, expenses, petty cash, ledgers,
ageing, payment history, reports, users and permissions matrix, audit log.

STEP F - Integration and polish
Wire CSP so the app runs with no violations in the browser console. Verify every list
exports Excel correctly. Make sure first run shows seeded data in every chart.
Provide run scripts: backend `dotnet run`, frontend `npm start`.

Rules: no feature creep, no placeholder TODOs left, build must pass with zero warnings
treated as errors for the backend, `ng build` must pass in strict mode.
Definition of done: all items in Section 13 acceptance checklist are manually runnable.
```

### 12.3 Phase 3 - QA (Claude Opus 5.5, high effort)

```
[Shared preamble]

ROLE: Principal QA and security engineer. You did not write this code. Assume bugs exist.
TASK: Completely QA TechTill against docs/MASTER_PROMPT_AND_PLAN.md and docs/ui-design/.
Run the app, run all tests, and exercise it in a browser. Fix defects directly when the
fix is small and safe; log everything in docs/qa-report.md.

Cover:
1. Functional: every module, every CRUD path, POS happy path and edge cases (zero stock,
   discount greater than total, partial payment, walk-in vs credit customer, void invoice).
2. Accounting integrity: verify Assets = Liabilities + Equity, P&L ties to source rows,
   ageing totals equal ledger balances, invoice-wise sums equal customer-wise sums,
   stock quantity equals the sum of movements. Use SQL queries to cross-check.
3. Roles: Admin vs each standard user, read-only vs write, shop scoping. Try direct API
   calls with a lower-privilege token to prove the backend enforces it (not only the UI).
4. Security: auth bypass, IDOR across shops, SQL/LINQ injection through filter and sort
   fields, XSS in text fields, CSRF/CORS, CSP violations in console, security headers,
   brute-force login, password hashing, token expiry and refresh, secrets in repo.
5. Errors: trigger 400/401/403/404/500 and offline, confirm correct page/toast and that
   no stack trace leaks.
6. Logging: confirm every action in Section 11 appears in AuditLog and Serilog files.
7. Tables: sort, column search, advanced filter, column chooser, pagination, Excel export
   content matches the filtered view.
8. UI: compare to design mockups, sidebar on every page, light theme, contrast, keyboard
   navigation, responsive at 1366, 1024, 768 widths, empty/loading/error states.
9. Performance: dashboard load time, query with 10k invoices, cache invalidation correctness.
10. Build and docs: clean clone builds, README steps work exactly as written.

Output docs/qa-report.md with: summary, test matrix (pass/fail), defects table
(id, severity, module, steps, expected, actual, status), fixes applied, remaining risks,
and a release verdict (GO / NO-GO). Do not mark GO while any Critical or High defect is open.
```

### 12.4 Phase 4 - README and packaging (Sonnet 5.5)

```
[Shared preamble]

Write README.md at the repo root for GitHub: product name and tagline, feature list,
screenshots placeholder section, tech stack, architecture diagram (Mermaid), folder
structure, prerequisites (.NET 8 SDK, Node LTS), quick start (backend, frontend),
default demo accounts (1 admin, 5 standard users, local use only), configuration
(appsettings, JWT secret via user-secrets or env), roles and permissions explanation,
testing instructions, security notes (CSP, headers, logging), roadmap (out-of-scope items
as future work), license (MIT). Add .gitignore (dotnet + node), and a short CONTRIBUTING
note. Keep it concise and accurate. Verify every command by running it.
```

---

## 13. Master prompt (single-shot version)

Use this if you want one prompt for a single long agent run instead of the phased flow. The phased flow in Section 12 gives better quality.

```
Build "TechTill", a small MVP for a computer shop owner with multiple shops (computers,
laptops, accessories). Stack: ASP.NET Core 8 Web API (Clean Architecture), EF Core + SQLite,
Angular 18 standalone, SweetAlert2 (toast top-end), top progress bar, IMemoryCache,
strict CSP (self, inline styles allowed), Serilog. Repo has backend/ and frontend/ folders.

Features (only these): auth with 1 admin + 5 standard users and per-module read/write
role control; shops; products and categories; per-shop stock with adjust and transfer;
suppliers and purchase bills; customers; POS with invoices (cash/card/bank/credit/partial);
expenses; petty cash; customer and supplier ledgers; receivables and payables with
ageing (customer-wise and invoice-wise) and payment history; Daily/Monthly summary,
Profit and Loss, Balance Sheet, Cash Flow; dashboard with 8 multi-color KPI cards and
6 different chart types; audit log of every activity; error pages for 400/401/403/404/500/offline.

Every table: server-side pagination, multi-column sort, column-wise search, advanced filter,
column chooser, Excel export of the filtered view.

UI: light theme, SaaS-level polish, multi-color components, sidebar on every page,
keyboard-friendly POS. Design the UI first, then build, then QA everything and fix defects.
Deliver README.md for GitHub. Keep it small. Do not add extra features.
Full spec: docs/MASTER_PROMPT_AND_PLAN.md.
```

---

## 14. Acceptance checklist

- [ ] Clean clone builds and runs with two commands (backend, frontend)
- [ ] Seeded data fills every dashboard card and chart
- [ ] Admin can create a user, assign shops, set per-module read/write, and the effect is immediate
- [ ] Standard user without write cannot POST/PUT/DELETE (verified via API, not only UI)
- [ ] POS sale reduces stock, creates invoice, updates ledger and receivable
- [ ] Purchase bill increases stock and creates payable
- [ ] Ageing totals match ledger balances (customer-wise and invoice-wise)
- [ ] Balance Sheet balances; P&L ties to invoices and expenses
- [ ] Every list: sort, column search, filter, column chooser, Excel export
- [ ] Audit log records all state-changing actions and logins
- [ ] 400/401/403/404/500/offline pages work
- [ ] No CSP violations in browser console
- [ ] QA report verdict is GO
- [ ] README verified by following it from scratch

---

## 15. Suggested timeline (solo with AI agents)

| Day | Work |
|-----|------|
| 1 | Phase 1 design, review and approve |
| 2 | Dev steps A and B |
| 3 | Dev steps C and D |
| 4 | Dev steps E and F |
| 5 | Phase 3 QA, fix cycle |
| 6 | Re-test, Phase 4 README, push to GitHub |

---

## 16. Notes and decisions

- **No due dates in MVP:** ageing uses document date. Add due dates in v2.
- **No returns in MVP:** use Void (Admin) or manual stock adjustment.
- **SQLite concurrency:** fine for a small shop count. Enable WAL mode. Note PostgreSQL as the upgrade path.
- **Excel in AG Grid Community:** the built-in export is Enterprise only, so export is done server-side with ClosedXML.
- **Model naming:** if a model name is not available in your tool, use the closest Opus-tier model for design and QA and Sonnet-tier for development. The phase split matters more than the exact model.