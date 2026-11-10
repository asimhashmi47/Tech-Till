# Acceptance criteria

Every criterion has at least one test tagged with its id: `[Trait("AC", "SALE-01")]` in the .NET suites, `AC:UI-01` in the test name for the client and E2E suites. `node scripts/check-ac-coverage.mjs` fails if an id here has no test.

## Assumptions

1. One business owns all shops, so there is no tenant boundary. Isolation is per shop, per user.
2. Customers, suppliers, products and categories are shared master data across shops. Their balances and stock are shop scoped.
3. Unit price stays editable at the till. Staff carts cannot go more than 10% below list price (SALE-17); the owner has no limit.
4. Money is stored as SQLite REAL. Tests compare to two decimal places where a sum crosses the database.
5. Tests run on a disposable database. The developer's `techtill.db` is never opened by a test.

## Authentication

| Id | Criterion |
|---|---|
| AUTH-01 | Valid credentials return access token, refresh token and profile; last login and an audit row are written |
| AUTH-02 | Wrong password, unknown user and inactive user get the same 403 message; a LoginFailed audit row is written |
| AUTH-03 | Refresh issues a new pair and revokes the old refresh token |
| AUTH-04 | Refresh rejects unknown, revoked and expired tokens, and tokens of inactive users |
| AUTH-05 | Logout revokes the supplied refresh token and is safe with none |
| AUTH-06 | Change password needs the current password and 8+ characters, re-hashes, and revokes every session |
| AUTH-07 | Me returns the caller's profile with only assigned, active, undeleted shops |
| AUTH-08 | The API rejects missing, tampered, alg-none, wrong-issuer and expired tokens with 401 |
| AUTH-09 | Sign-in is rate limited with 429 |
| AUTH-10 | The API refuses to start without a signing key of at least 32 characters |
| AUTH-11 | Deactivating or demoting a user ends their access tokens on the next request; other edits do not |
| AUTH-12 | Logout ends that access token only; a password change ends all of them |
| AUTH-14 | A failed sign-in for an unknown or inactive user still runs one password check, so timing does not reveal the username |
| AUTH-15 | Refresh tokens are stored only as a hash; replaying a rotated token after 30 seconds ends every session of that user |
| AUTH-16 | Logout revokes a refresh token only when it belongs to the caller |
| AUTH-13 | Sign-in is limited per address, ten failures lock that account from that address for 15 minutes, a success clears them, and refresh has its own budget |

## Permissions

| Id | Criterion |
|---|---|
| PERM-01 | Admin has every module and every undeleted shop |
| PERM-02 | Standard users get exactly their matrix, and write implies read |
| PERM-03 | Users and AuditLog stay admin only whatever the stored rows say |
| PERM-04 | Asking for a shop outside the assignment is refused; no shop means all assigned shops |
| PERM-05 | Invalidate makes a permission change effective immediately |
| PERM-06 | Every endpoint needs a token except login, refresh and health |
| PERM-07 | Every action declares a module permission, admin-only, or is on the reviewed allow-list; a low-privilege token gets 403 |
| PERM-09 | Customer and supplier pickers need read on a module that uses them and return no contact details |
| PERM-08 | A detail read for another shop's record returns 404 and a shop-scoped write returns 403 |

## Grid and query contract

| Id | Criterion |
|---|---|
| QRY-01 | Every operator filters correctly per value type, including unicode text |
| QRY-02 | Fields outside the whitelist are ignored for filter, sort and export columns |
| QRY-03 | Filter groups join rules with AND / OR, nest, and combine with column filters using AND |
| QRY-04 | Global search covers searchable text fields only |
| QRY-05 | Page and page size are clamped: page below 1 becomes 1, size outside 1..500 becomes 25 |
| QRY-06 | SQL metacharacters in a value are treated as literal data |
| QRY-07 | Sort honours direction and multiple rules |
| QRY-08 | Malformed values are ignored rather than failing the request |
| QRY-09 | More than 50 filter nodes, 5 group levels or 10 sort keys return 400 on every query and export path |

## Sales

| Id | Criterion |
|---|---|
| SALE-01 | A sale raises a numbered invoice, freezes unit cost, and moves stock |
| SALE-02 | Paid, partial and unpaid sales get the right status; a payment row is written only when money is taken |
| SALE-03 | Only a cash payment writes a drawer entry |
| SALE-04 | Empty cart, zero or negative quantity, negative price, bad discount and bad paid amount return 400 |
| SALE-05 | Stock is checked per product across duplicate lines |
| SALE-06 | Walk-in sales must be paid in full |
| SALE-07 | Unknown customer or product returns 400; a shop outside the assignment returns 403 |
| SALE-08 | Void restores stock, reverses linked receipts and cash, and keeps the invoice number |
| SALE-09 | Void needs admin and a reason; voiding twice returns 409 |
| SALE-10 | A receipt without an invoice clears the oldest open invoices first |
| SALE-11 | A receipt above what is owed returns 400 |
| SALE-12 | A receipt against an invoice must match its customer and shop, must not exceed its outstanding, and cannot target a void invoice |
| SALE-13 | Amounts too large to compute return 400, not 500 |
| SALE-14 | A failure part way through a sale rolls everything back |
| SALE-15 | Parallel voids of one invoice succeed once and restore stock and cash once |
| SALE-16 | The same Idempotency-Key from one cashier bills once and returns the same invoice; a different cart on that key returns 409 |
| SALE-19 | An inactive product cannot be sold |
| SALE-18 | Voiding an invoice moves the part paid by on-account receipts to the customer's next open invoices |
| SALE-17 | A staff cart cannot total more than 10% below list price, the owner has no limit, and any override records list and charged in the audit log |

## Stock

| Id | Criterion |
|---|---|
| STK-01 | Adjust needs a non-zero quantity and a reason, cannot go negative, and writes a movement |
| STK-02 | Transfer moves between two different shops within available stock and needs write on both |
| STK-03 | Opening stock sets the level through a movement and is a no-op when unchanged |
| STK-04 | Quantity on hand always equals the sum of its movements |
| STK-05 | Low stock lists rows at or below the reorder level, most urgent first |
| STK-06 | A change that would overflow the stored quantity returns 400 |
| STK-07 | Parallel sales, adjustments and transfers can never take a shop below zero |
## Purchases

| Id | Criterion |
|---|---|
| PUR-01 | A bill adds stock, updates product cost, numbers itself, and records what was paid |
| PUR-02 | Only cash paid writes a drawer entry |
| PUR-03 | Empty bill, bad quantity, negative cost, unknown supplier, unknown product and bad paid amount return 400 |
| PUR-04 | A payment above the balance returns 400; without a bill it clears oldest first |
| PUR-05 | A payment against a bill must match its supplier and shop and must not exceed its outstanding |

## Money

| Id | Criterion |
|---|---|
| EXP-01 | Expense needs an amount above zero and a valid category |
| EXP-02 | A cash expense writes a drawer entry; updating rebuilds it; deleting removes it |
| EXP-03 | Expenses are scoped to assigned shops for read and write |
| PET-01 | Cash in and out need an amount above zero; cash out cannot exceed the drawer |
| PET-02 | Day view shows opening, in, out and closing per shop |
| PET-03 | A drawer entry owned by an expense cannot be deleted directly |
| PET-04 | A drawer entry written by a sale, receipt or payment cannot be deleted directly |

| DATE-01 | Receipts, payments, bills, expenses and drawer entries cannot be dated in the future; staff can backdate 31 days, the owner back to 2000 |
| PAY-01 | Receipts and payments cannot be marked Credit, credit sales and bills take nothing now, and Credit rows never count as cash |

## Master data

| Id | Criterion |
|---|---|
| MST-01 | Products need SKU, name, valid category and non-negative numbers; SKU is unique and normalised |
| MST-02 | Deleting a product with history retires it, without history removes it |
| MST-03 | Categories need a unique non-blank name and cannot be deleted while in use |
| MST-04 | Customers and suppliers need a non-blank name on create and update |
| MST-05 | Deleting a party with documents deactivates it; the walk-in customer cannot be deleted |
| MST-06 | Party balances count only the caller's shops |
| MST-07 | Shops need a unique non-blank code and name; code is upper-cased |
| MST-08 | POS search matches SKU, name or brand, shows that shop's stock, and hides inactive products |

## Admin

| Id | Criterion |
|---|---|
| USR-01 | Creating a user needs a unique non-blank username, a full name and an 8+ character password |
| USR-02 | Shops and permissions are replaced on save, and must reference real shops |
| USR-03 | Deactivating revokes sessions; an admin cannot be deactivated |
| USR-05 | Passwords are 8 to 128 characters, not the username and not a common password; an admin reset ends the user's sessions |
| USR-04 | The last active owner cannot be demoted or set inactive through an edit |
| SET-01 | Only admin can change currency, and only to a listed code |
| AUD-01 | Sensitive actions write an audit row with user, module and action; long summaries are trimmed |
| AUD-02 | Only admin can read the audit log |

## Books

| Id | Criterion |
|---|---|
| LED-01 | A ledger runs invoices and receipts in date order, with opening and closing for a date range |
| LED-02 | Ledger closing equals the party balance |
| AGE-01 | Outstanding falls in the right bucket at each boundary |
| AGE-02 | Party and document views have equal totals |
| AGE-03 | As-at ageing excludes documents dated after the as-at date |
| RPT-01 | Profit and loss: revenue less cost less expenses, excluding void invoices |
| RPT-02 | Balance sheet: assets equal liabilities plus equity |
| RPT-03 | Ageing totals equal receivables and payables on the balance sheet |
| RPT-04 | Cash flow: opening plus in less out equals closing |
| RPT-05 | Daily and monthly summaries bucket by date; a reversed range does not fail |
| RPT-06 | Report, ledger and dashboard dates must fall in 2000 to 2099 and span at most 10 years, or return 400 |
| DSH-01 | Dashboard swaps a reversed range, buckets by month past 62 days, and scopes to shop |
| PERF-01 | Users who see the same shops share one cached dashboard, and concurrent misses build it once |
| DOC-01 | Document numbers are per shop, per month, and increase |
| XLS-01 | Excel export honours the column whitelist and writes user text as text, not formulas |

## HTTP contract

| Id | Criterion |
|---|---|
| API-01 | Errors are RFC 7807 with a correlation id and no stack trace in production |
| API-02 | Security headers are present on every response |
| API-03 | Migrations apply to an empty database and the seed makes every report non-empty |
| API-04 | Responses match the documented contract: paging fields, enums as strings, nulls omitted |
| API-05 | Exports return a spreadsheet with a filename |
| API-06 | Repeating an already-applied void, delete or logout is safe |
| API-10 | X-Forwarded-For is believed only from configured proxies, and HTTPS redirection can be switched on |
| API-09 | Outside Development a 500 carries a correlation id and never a stack trace |
| API-08 | Each signed-in user has a budget of 600 requests and 10 exports a minute, beyond which they get 429 and nobody else is affected |
| API-07 | Text longer than its column returns 400 on that field, and a body over 1 MB returns 413 |
| BOOT-01 | Outside Development, a new database refuses to start without a private owner password of 12+ characters |
| BOOT-02 | Outside Development, a new database gets only the owner and the walk-in customer, and an existing database is left alone |

## Client and user journeys

| Id | Criterion |
|---|---|
| UI-01 | Sign in lands on the dashboard; a wrong password shows an inline error |
| UI-02 | A user without access does not see the module and is sent to 403 on direct URL |
| UI-03 | The till completes a cash sale and shows the invoice |
| UI-04 | A product can be added through the drawer and is found by the grid search |
| UI-05 | Grid column search, rule builder and CSV download work against the API |
| UI-06 | Sign out ends the session |
| UI-07 | Number and date filter syntax produce the right API rules |
| UI-08 | CSV cells are quoted and cannot execute as formulas |
| UI-09 | Bell alerts count only what has not been seen |
| UI-10 | Money formats follow the active currency |
| UI-11 | Route guards follow the access matrix |
| UI-12 | Background polls never toast or redirect |
