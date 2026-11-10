<a id="top"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/readme/banner-dark.png">
  <img alt="TechTill: the till, the shelf and the books in one place. Point of sale, stock and accounting for computer shops." src="images/readme/banner-light.png" width="100%">
</picture>

<p align="center">
  <img alt=".NET 10" src="https://img.shields.io/badge/.NET-10-512BD4?style=for-the-badge&logo=dotnet&logoColor=white">
  <img alt="Angular 20" src="https://img.shields.io/badge/Angular-20-DD0031?style=for-the-badge&logo=angular&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white">
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white">
  <img alt="ApexCharts" src="https://img.shields.io/badge/ApexCharts-8-803FC6?style=for-the-badge">
</p>
<p align="center">
  <img alt="Warnings are errors" src="https://img.shields.io/badge/build-warnings_are_errors-2E9C83?style=flat-square">
  <img alt="Content Security Policy self" src="https://img.shields.io/badge/CSP-self_only-2E9C83?style=flat-square">
  <img alt="Test projects are scaffolded" src="https://img.shields.io/badge/tests-scaffolded-E3A13B?style=flat-square">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-803FC6?style=flat-square">
</p>

<p align="center">
  <a href="#-quick-start"><b>Quick start</b></a> ·
  <a href="#-a-tour-of-the-app"><b>Tour</b></a> ·
  <a href="#-screenshot-gallery"><b>Gallery</b></a> ·
  <a href="#-architecture"><b>Architecture</b></a> ·
  <a href="#-security"><b>Security</b></a> ·
  <a href="#-testing"><b>Testing</b></a> ·
  <a href="DESIGN.md"><b>Design</b></a>
</p>

<br>

<p align="center">
  <img alt="TechTill on desktop and on a phone" src="images/readme/hero.png" width="100%">
</p>

<br>

**TechTill** is point of sale, inventory and small-business accounting for computer shops, built as one ASP.NET Core API and one Angular app. A shopkeeper running two or three branches needs the till, the stock on the shelf and the books to agree with each other. TechTill keeps them in one database: a sale at the counter moves stock, raises an invoice, posts to the customer account and lands in the cash drawer.

The balance sheet that comes out at the end is one that actually balances, and the app says so on screen.

<table>
  <tr>
    <td align="center" width="25%"><h2>97</h2><sub>API endpoints on one<br>Clean Architecture backend</sub></td>
    <td align="center" width="25%"><h2>15</h2><sub>modules with read and write<br>permissions per user</sub></td>
    <td align="center" width="25%"><h2>13</h2><sub>filter operators on<br>every server-side grid</sub></td>
    <td align="center" width="25%"><h2>0</h2><sub>CDN requests: fonts and icons<br>ship with the app</sub></td>
  </tr>
</table>

<br>

## ✦ Highlights

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🧾 Built for the counter</h3>
      A till with barcode or text search, category filters and keyboard shortcuts (<kbd>F2</kbd> search, <kbd>F9</kbd> take payment). Cash, card, bank and credit, with change due and part payment onto the customer account.
    </td>
    <td width="33%" valign="top">
      <h3>📦 Stock with a trail</h3>
      Per-shop stock with a movement history: opening, purchase, sale, adjustment, transfer and sale reversal. Transfers between shops, and a low-stock count in the bell.
    </td>
    <td width="33%" valign="top">
      <h3>🛒 Buying that posts itself</h3>
      Purchase bills put stock on the shelf and anything unpaid onto the supplier account. Pay against a specific bill, or oldest-first across the account.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h3>📊 Books that close</h3>
      Profit and loss, balance sheet, direct-method cash flow, and ageing by party or document. Customer and supplier ledgers close on the same figure as the party balance.
    </td>
    <td width="33%" valign="top">
      <h3>🏬 Many shops, one owner</h3>
      Any number of shops, and every screen can show one shop or all of them. Currency is chosen once in Settings and applied to every money figure in the app.
    </td>
    <td width="33%" valign="top">
      <h3>🛡️ Enforced on the server</h3>
      Per-module read and write permissions checked in the API, not just the menu. Field whitelists on every list query, and an audit log of logins, edits, voids, exports and permission changes.
    </td>
  </tr>
</table>

<br>

## ✦ Quick start

> [!NOTE]
> **You need** the [.NET SDK 10](https://dotnet.microsoft.com/download) and [Node.js 20.19+](https://nodejs.org/) with npm. No database server is needed: SQLite is a file, and migrations plus the demo seed run on first start.

**1. Start the API** on <http://localhost:5080>. Swagger UI is at `/swagger`.

```bash
cd backend/src/TechTill.Api
```

```bash
dotnet run
```

**2. Start the client** in a second terminal, then open <http://localhost:4200>. The dev server proxies `/api` to the backend, so there is nothing else to configure.

```bash
cd frontend
```

```bash
npm install
```

```bash
npm start
```

**3. Sign in.** Development builds show a demo helper on the sign-in page. Seeded for local use only, with the same password for every account: `TechTill#2026`.

| Username | Role | Can do |
|---|---|---|
| `admin` | Admin | Everything, including users, settings and the audit log |
| `sara` | Standard | Writes POS, invoices, customers. Reads dashboard, products, stock. Shop 1 |
| `bilal` | Standard | Writes POS, invoices, customers, expenses, petty cash. Reads reports. Shop 2 |
| `hina` | Standard | Writes products, stock, purchases, suppliers. Reads invoices, reports. Both shops |
| `omar` | Standard | Writes expenses, petty cash. Reads reports, invoices. Both shops |
| `zoya` | Standard | Read only, shop 1 |

On first start in Development the database is created at `backend/src/TechTill.Api/techtill.db` and seeded with two shops, a product catalogue, customers, suppliers and six months of sales, purchases, expenses and cash movements. Delete the file to start again.

<details>
<summary><b>Configuration, secrets and production build</b></summary>

<br>

Settings come from `appsettings.json`, then the environment, then user secrets.

| Key | Environment variable | Notes |
|---|---|---|
| `Jwt:Secret` | `JWT__SECRET` | Required, at least 32 characters. The app refuses to start without it |
| `Bootstrap:AdminPassword` | `BOOTSTRAP__ADMINPASSWORD` | Required outside Development when the database is new: the `admin` password, at least 12 characters. A new database then gets only that account and the walk-in customer |
| `RateLimits:SignInPerIpPerMinute` | `RATELIMITS__SIGNINPERIPPERMINUTE` | Default 60. Behind a reverse proxy every client shares one address until forwarded headers are configured |
| `RateLimits:RefreshPerIpPerMinute` | `RATELIMITS__REFRESHPERIPPERMINUTE` | Default 120 |
| `RateLimits:RequestsPerUserPerMinute` | `RATELIMITS__REQUESTSPERUSERPERMINUTE` | Default 600 |
| `RateLimits:ExportsPerUserPerMinute` | `RATELIMITS__EXPORTSPERUSERPERMINUTE` | Default 10 |
| `Jwt:Issuer` / `Jwt:Audience` | `JWT__ISSUER` / `JWT__AUDIENCE` | Default `TechTill` |
| `Jwt:AccessTokenMinutes` | `JWT__ACCESSTOKENMINUTES` | Default 30 |
| `Jwt:RefreshTokenDays` | `JWT__REFRESHTOKENDAYS` | Default 7 |
| `ConnectionStrings:Default` | `CONNECTIONSTRINGS__DEFAULT` | Default `Data Source=techtill.db` |
| `Cors:AllowedOrigins` | `CORS__ALLOWEDORIGINS__0` | Default `http://localhost:4200` |

In `Development` a placeholder signing key ships in `appsettings.Development.json`, so `dotnet run` works while you are trying it out. Never commit a real signing key: use `dotnet user-secrets` locally and environment variables in deployment.

```bash
dotnet user-secrets set "Jwt:Secret" "replace-this-with-at-least-32-characters"
```

**Rebuilding on Windows.** Windows holds an exclusive lock on the host executable of a running app, so a Debug build stops the previous instance first. Pass `-p:StopRunningApiBeforeBuild=false` to keep a running instance alive.

**Production build.** The client builds to `frontend/dist/techtill-web`. The demo helper and its seeded password are removed from production bundles.

```bash
cd frontend && npm run build
```

Change the demo accounts before deploying anywhere.

</details>

<p align="right"><a href="#top">↑ back to top</a></p>

## ✦ A tour of the app

<table>
  <tr>
    <td width="42%" valign="top">
      <h3>Point of sale</h3>
      <p>Touch-friendly product tiles with live stock per shop, and a cart that stays in view.</p>
      <ul>
        <li>Barcode or text search with <kbd>F2</kbd>, payment with <kbd>F9</kbd></li>
        <li>Cash, card, bank and credit, with change due</li>
        <li>Part payment goes onto the customer account</li>
        <li>Product cost is frozen on the line, so later price changes never move historical profit</li>
      </ul>
    </td>
    <td width="58%"><img src="images/03-pos.png" alt="Point of sale with a filled cart"></td>
  </tr>
  <tr>
    <td width="58%"><img src="images/05-invoice-detail.png" alt="Invoice detail with status and totals"></td>
    <td width="42%" valign="top">
      <h3>Invoices</h3>
      <p>Every completed sale, with its lines, payments, customer and shop.</p>
      <ul>
        <li>A void keeps its number and its history</li>
        <li>Voiding reverses the stock in full and asks for a reason</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      <h3>Print</h3>
      <p>The invoice prints without the app around it, on A4 or an 80 mm roll.</p>
      <ul>
        <li>Shop name, address and phone from the shop record</li>
        <li>Switch format before printing</li>
      </ul>
    </td>
    <td width="58%"><img src="images/06-invoice-print.png" alt="A4 invoice print view"></td>
  </tr>
  <tr>
    <td width="58%"><img src="images/08-customer-ledger.png" alt="Customer ledger with running balance"></td>
    <td width="42%" valign="top">
      <h3>Customer and supplier ledgers</h3>
      <p>Invoices add to the balance and receipts reduce it, with a running figure on every line.</p>
      <ul>
        <li>Filter by date, with opening and closing balances</li>
        <li>The closing balance matches the party balance</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      <h3>Stock</h3>
      <p>Quantity on hand per shop. Every change writes a movement, so the total always matches the sum of its history.</p>
      <ul>
        <li>Opening, purchase, sale, adjustment, transfer and sale reversal</li>
        <li>Transfers between shops</li>
      </ul>
    </td>
    <td width="58%"><img src="images/14-stock-movements.png" alt="Stock movements"></td>
  </tr>
  <tr>
    <td width="58%"><img src="images/17-purchase-form.png" alt="New purchase bill"></td>
    <td width="42%" valign="top">
      <h3>Purchases</h3>
      <p>Saving a bill adds the quantities to the shop's stock and sets each product's cost to the unit cost entered.</p>
      <ul>
        <li>Anything unpaid goes onto the supplier account</li>
        <li>Pay against one bill, or oldest-first</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      <h3>One grid, everywhere</h3>
      <p>Every list in the app has the same tools:</p>
      <ul>
        <li>Global search and a search row per column, with <code>&gt;500</code> and <code>10..20</code> on numbers</li>
        <li>AND / OR rule builder and column chooser</li>
        <li><b>Download the filtered rows</b> to Excel or CSV</li>
        <li>Sorting, filtering and paging run on the server</li>
      </ul>
    </td>
    <td width="58%"><img src="images/12-advanced-filter.png" alt="Products grid with the advanced filter builder"></td>
  </tr>
  <tr>
    <td width="58%"><img src="images/19-petty-cash.png" alt="Petty cash by shop"></td>
    <td width="42%" valign="top">
      <h3>Petty cash and expenses</h3>
      <p>A cash drawer per shop. Cash sales, cash receipts and cash expenses flow in automatically.</p>
      <ul>
        <li>Buttons for a float or a withdrawal</li>
        <li>Expenses by category reduce profit on their own date</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      <h3>Receivables and payables</h3>
      <p>Ageing by party or by document, in current, 1 to 30, 31 to 60, 61 to 90 and over 90 day buckets.</p>
      <p>The bucket totals match the balance sheet.</p>
    </td>
    <td width="58%"><img src="images/20-receivables.png" alt="Receivables ageing"></td>
  </tr>
  <tr>
    <td width="58%"><img src="images/23-profit-and-loss.png" alt="Profit and loss statement"></td>
    <td width="42%" valign="top">
      <h3>Financial statements</h3>
      <p>Summary, profit and loss, balance sheet and a direct-method cash flow, for one shop or all of them.</p>
      <ul>
        <li>Date range with quick presets</li>
        <li>The balance sheet shows whether assets equal liabilities plus equity</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      <h3>Users and permissions</h3>
      <p>Read or write per module and access per shop, granted by the owner.</p>
      <ul>
        <li>The API refuses the call whatever the menu shows</li>
        <li>Permission changes are written to the audit log</li>
      </ul>
    </td>
    <td width="58%"><img src="images/27-users.png" alt="Users and permissions"></td>
  </tr>
</table>

<p align="right"><a href="#top">↑ back to top</a></p>

## ✦ Screenshot gallery

<details>
<summary><b>All 31 screens</b> (click to expand)</summary>

<br>

| | |
|:---:|:---:|
| <img src="images/01-login.png" alt="Sign in"><br><sub><b>Sign in</b> with demo helper</sub> | <img src="images/02-dashboard.png" alt="Dashboard"><br><sub><b>Dashboard</b>, where every tile opens its records</sub> |
| <img src="images/02b-dashboard-lower.png" alt="Dashboard charts"><br><sub><b>Dashboard</b> charts and lists</sub> | <img src="images/03-pos.png" alt="POS"><br><sub><b>Point of sale</b></sub> |
| <img src="images/04-invoices.png" alt="Invoices"><br><sub><b>Invoices</b></sub> | <img src="images/05-invoice-detail.png" alt="Invoice detail"><br><sub><b>Invoice detail</b></sub> |
| <img src="images/06-invoice-print.png" alt="Invoice print"><br><sub><b>Invoice print</b>, A4 or 80 mm</sub> | <img src="images/07-customers.png" alt="Customers"><br><sub><b>Customers</b></sub> |
| <img src="images/08-customer-ledger.png" alt="Customer ledger"><br><sub><b>Customer ledger</b></sub> | <img src="images/09-receipts.png" alt="Receipts"><br><sub><b>Customer receipts</b></sub> |
| <img src="images/10-products.png" alt="Products"><br><sub><b>Products</b></sub> | <img src="images/11-product-editor.png" alt="Product editor"><br><sub><b>Product editor</b> drawer</sub> |
| <img src="images/12-advanced-filter.png" alt="Advanced filter"><br><sub><b>Advanced filter</b> builder</sub> | <img src="images/13-stock.png" alt="Stock"><br><sub><b>Stock</b> on hand</sub> |
| <img src="images/14-stock-movements.png" alt="Stock movements"><br><sub><b>Stock movements</b></sub> | <img src="images/15-suppliers.png" alt="Suppliers"><br><sub><b>Suppliers</b></sub> |
| <img src="images/16-purchases.png" alt="Purchases"><br><sub><b>Purchases</b></sub> | <img src="images/17-purchase-form.png" alt="New purchase bill"><br><sub><b>New purchase bill</b></sub> |
| <img src="images/18-expenses.png" alt="Expenses"><br><sub><b>Expenses</b></sub> | <img src="images/19-petty-cash.png" alt="Petty cash"><br><sub><b>Petty cash</b></sub> |
| <img src="images/20-receivables.png" alt="Receivables"><br><sub><b>Receivables</b> ageing</sub> | <img src="images/21-payables.png" alt="Payables"><br><sub><b>Payables</b> ageing</sub> |
| <img src="images/22-summary.png" alt="Summary"><br><sub><b>Summary</b> report</sub> | <img src="images/23-profit-and-loss.png" alt="Profit and loss"><br><sub><b>Profit and loss</b></sub> |
| <img src="images/24-balance-sheet.png" alt="Balance sheet"><br><sub><b>Balance sheet</b></sub> | <img src="images/25-cash-flow.png" alt="Cash flow"><br><sub><b>Cash flow</b></sub> |
| <img src="images/26-shops.png" alt="Shops"><br><sub><b>Shops</b></sub> | <img src="images/27-users.png" alt="Users"><br><sub><b>Users and permissions</b></sub> |
| <img src="images/28-settings.png" alt="Settings"><br><sub><b>Settings</b></sub> | <img src="images/29-audit-log.png" alt="Audit log"><br><sub><b>Audit log</b></sub> |
| <img src="images/30-mobile-dashboard.png" alt="Dashboard on a phone" width="240"><br><sub><b>Dashboard</b> on a phone</sub> | |

</details>

<p align="right"><a href="#top">↑ back to top</a></p>

## ✦ Tech stack

<table>
  <tr>
    <th align="left" width="50%">Backend</th>
    <th align="left" width="50%">Frontend</th>
  </tr>
  <tr>
    <td valign="top">
      <b>.NET 10</b> and ASP.NET Core Web API<br>
      <b>Clean Architecture</b>: Domain ← Application ← Infrastructure ← Api<br>
      <b>EF Core 10</b> on SQLite in WAL mode<br>
      <b>JWT</b> access and refresh tokens, <b>BCrypt</b> password hashing<br>
      <b>Serilog</b> structured logging<br>
      <b>RFC 7807</b> problem details<br>
      <b>ClosedXML</b> for Excel export<br>
      <b>Swagger UI</b> in development
    </td>
    <td valign="top">
      <b>Angular 20</b>: standalone components, signals, lazy routes<br>
      <b>Tailwind CSS 4</b> with OKLCH design tokens<br>
      <b>ApexCharts</b> for dashboards and reports<br>
      <b>Lucide</b> icons, only the ones in use are bundled<br>
      <b>SweetAlert2</b> for toasts and confirmations<br>
      <b>Geist</b> and <b>Geist Mono</b>, self-hosted<br>
      <sub>One data table for every list, with sorting, filtering and paging on the server.</sub>
    </td>
  </tr>
  <tr>
    <th align="left">Quality</th>
    <th align="left">Tooling</th>
  </tr>
  <tr>
    <td valign="top">
      <b>xUnit</b> unit and integration test projects, wired into the solution<br>
      Warnings are errors outside the test projects<br>
      Runtime checks of the accounting identities in the reports
    </td>
    <td valign="top">
      Angular CLI build with strict templates<br>
      <code>frontend/scripts/gen-icons.mjs</code> keeps the icon bundle to what the app uses<br>
      Headless Chrome scripts that regenerate every image in this README
    </td>
  </tr>
</table>

## ✦ Architecture

```mermaid
flowchart LR
    subgraph Browser["Angular 20 client"]
        UI["Pages: POS, Invoices, Stock,<br/>Purchases, Accounting, Reports…"]
        DT["Shared data grid<br/>(search, filters, download)"]
        AUTH["Auth service<br/>(access matrix)"]
        UI --> DT
        UI --> AUTH
    end

    subgraph Api["TechTill.Api"]
        CTRL["Controllers<br/>RequirePermission, AdminOnly"]
        MW["Security headers ·<br/>problem details"]
    end

    subgraph App["TechTill.Application"]
        SVC["Services: Sales, Stock, Purchases,<br/>Ledgers, Reports…"]
        QE["QuerySpec whitelist<br/>(QueryRequest → parameterised LINQ)"]
    end

    subgraph Dom["TechTill.Domain"]
        ENT["Entities, enums, rules"]
    end

    subgraph Infra["TechTill.Infrastructure"]
        EF["AppDbContext · migrations"]
        EXP["Excel export"]
        SEC["JWT · cache · audit"]
        SEED["Demo seed"]
    end

    DB[("SQLite<br/>techtill.db, WAL")]

    AUTH -- "Bearer JWT" --> CTRL
    DT -- "POST /query · /export" --> CTRL
    CTRL --> SVC
    SVC --> QE
    SVC --> ENT
    SVC --> EF
    CTRL --> EXP
    CTRL --> SEC
    EF --> DB
    SEED --> DB
```

Grids share one contract. Every list screen posts a `QueryRequest` to `POST /api/{resource}/query`, naming the page, sort and filters it wants. Fields are matched against a per-resource whitelist before any expression is built, so a filter cannot reach a column the screen was never given.

### The life of a sale

```mermaid
sequenceDiagram
    autonumber
    participant C as Cashier (POS)
    participant A as API
    participant D as SQLite
    C->>A: POST /api/pos/sale (lines, customer, payment)
    A->>D: begin transaction
    A->>D: invoice and lines, cost frozen per line
    A->>D: stock movement per line
    A->>D: customer payment for what was paid now
    A->>D: drawer entry when the payment is cash
    A->>D: commit
    A-->>C: invoice detail, ready to print
```

### The books agree

The reports assert these at runtime, and they have been checked in the browser against the seed data.

| Identity | What must hold |
|---|---|
| Balance sheet | Assets equal liabilities plus owner equity |
| Ageing | Bucket totals match receivables and payables on the balance sheet |
| Ledgers | A party's closing balance matches the party balance |
| Stock | On-hand quantity is the sum of its movement history |
| Profit | Each sale's cost is frozen on the line, so historical gross profit never moves |

<p align="right"><a href="#top">↑ back to top</a></p>

## ✦ Security

<details>
<summary><b>Authentication and sessions</b></summary>

- Passwords are hashed with BCrypt. They are never logged and never returned by the API.
- Access tokens are short lived. Refresh tokens are stored server side and revoked on sign-out.
- The demo credentials are seed data for a local database. Treat them as examples, not as defaults to deploy.

</details>

<details>
<summary><b>Roles and permissions</b></summary>

Two roles. **Admin** has everything and is the only role that can reach Users, Settings and the Audit log. **Standard** gets read or write per module, granted by an admin on the Users screen.

Modules: Dashboard, Shops, Products, Stock, Pos, Invoices, Customers, Suppliers, Purchases, Expenses, PettyCash, Reports, Users, AuditLog, Settings.

Permission is enforced on the server with `[RequirePermission(Module, Access)]` and `[AdminOnly]` attributes. Hiding a menu item is a convenience; the API refuses the call either way, and the same check decides which shops a user may see.

</details>

<details>
<summary><b>Data, transport and audit</b></summary>

- Every list query is matched against a field whitelist before an expression is built, and every value becomes an expression constant.
- A strict Content-Security-Policy is applied by middleware. Fonts and icons ship with the app rather than coming from a CDN.
- Errors come back as RFC 7807 problem details, without stack traces outside development.
- Toasts render user data as plain text, and HTML in grid cells passes through Angular's sanitizer.
- Logins, failures, edits, voids, exports and permission changes are written to the audit log.

</details>

## ✦ Testing

Both test projects are wired into the solution and currently hold a single placeholder test each. Filling them out, starting with the accounting identities the reports already assert at runtime, is the next piece of work.

The UI has been checked in the browser against live seed data.

| Check | Covered |
|---|---|
| Routes | Screens opened with no Angular errors in the console |
| Data table | Column search, number ranges, the rule builder, sort, paging and column chooser against the API |
| Permissions | Sidebar and routes with a lower-privilege account, and enforcement with a lower-privilege token |
| Accounting | Assets equal liabilities plus equity, ageing totals match the balance sheet, ledger closing matches the party balance |
| Builds | API with warnings as errors, client in production mode |

```bash
cd backend && dotnet test
```

```bash
cd frontend && npm run build
```

## ✦ Design

<img src="images/readme/palette.png" alt="Lavender palette: four lilac swatches and a deep brand violet" width="100%">

The "Lavender" palette keeps four pale swatches as tints and adds one deep violet on the same hue for everything that must carry white text. Destructive actions use a separate deep raspberry, so **Void never looks like Pay**. All tokens are OKLCH values in [`frontend/src/styles.css`](frontend/src/styles.css).

The type is Geist, with tabular numerals on every money column. Motion runs 160 to 260 ms on state changes only, respecting `prefers-reduced-motion`. See [DESIGN.md](DESIGN.md) for the full system.

## ✦ Project layout

```
backend/
  Directory.Build.props     net10.0, nullable, warnings as errors
  src/
    TechTill.Domain           entities, enums, no dependencies
    TechTill.Application      services, DTOs, query contract, validation
    TechTill.Infrastructure   EF Core, migrations, seeding, JWT, cache, Excel
    TechTill.Api              controllers, middleware, auth, Swagger
  tests/
    TechTill.UnitTests
    TechTill.IntegrationTests
frontend/
  proxy.conf.json           /api → http://localhost:5080
  scripts/gen-icons.mjs     writes the lucide icon registry
  src/
    styles.css              design tokens and shared component classes
    styles/techtill.css     additions for screens specific to TechTill
    app/
      core/                 auth, guards, interceptors, services
      shared/               shell, data grid, drawer, charts, page header
      features/             one folder per screen, lazy loaded
scripts/
  screenshots.mjs           regenerates images/ with headless Chrome
  readme-art.mjs            renders the banner, hero and palette in images/readme/
docs/                       original plan and design notes
images/                     screenshots and README artwork
```

To refresh the images, run both servers with demo data and then:

```bash
node scripts/screenshots.mjs && node scripts/readme-art.mjs
```

## ✦ Roadmap, contributing and licence

**Next up:** fill out the unit and integration test projects, due dates on invoices so ageing runs from the date money was actually due, tax and multi-currency pricing, barcode label printing, and a dark theme using the existing token layer.

**Contributing.** Issues and pull requests are welcome at <https://github.com/asimhashmi47/Tech-Till>. Please keep the backend building with zero warnings, run `dotnet build` and `npm run build` before opening a pull request, and match the surrounding style rather than introducing a new one.

**Licence.** MIT. See [LICENSE](LICENSE).

<br>

<div align="center">

**TechTill** · crafted in Karachi

© 2026 [masimaziz.com](https://masimaziz.com/) · [asimhashmi47@gmail.com](mailto:asimhashmi47@gmail.com)

<a href="#top">↑ back to top</a>

</div>
