using TechTill.Application.Features.Auth;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Reports;
using TechTill.Application.Features.Sales;
using TechTill.Application.Features.Settings;
using TechTill.Application.Features.Users;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

public sealed class AdminTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private SaveUserRequest NewUser(string username = "newbie", string fullName = "New Person", string? password = "long-enough", long[]? shops = null, PermissionInput[]? permissions = null)
        => new(username, fullName, UserRole.Standard, true, password, shops ?? [_app.ShopA], permissions ?? [new PermissionInput(Module.Stock, false, true), new PermissionInput(Module.Reports, false, false)]);

    [Fact]
    [Trait("AC", "USR-01")]
    public async Task Create_Valid_HashesPasswordAndAppliesAssignments()
    {
        var user = await _app.Users.CreateAsync(NewUser(username: " newbie "));

        Assert.Equal("newbie", user.Username);
        Assert.Equal([_app.ShopA], user.ShopIds);
        var permission = Assert.Single(user.Permissions);
        Assert.True(permission.CanRead);
        Assert.Equal(_app.Hasher.Hash("long-enough"), (await _app.Saved().Users.SingleAsync(u => u.Id == user.Id)).PasswordHash);
    }

    [Theory]
    [Trait("AC", "USR-01")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1234567")]
    public Task Create_BadPassword_IsRejected(string? password)
        => Expect.InvalidAsync("Password", () => _app.Users.CreateAsync(NewUser(password: password)));

    [Fact]
    [Trait("AC", "USR-01")]
    public Task Create_DuplicateUsername_IsRejected()
        => Expect.InvalidAsync("Username", () => _app.Users.CreateAsync(NewUser(username: "staff")));

    [Theory]
    [Trait("AC", "USR-01")]
    [InlineData("", "Name", "Username")]
    [InlineData("   ", "Name", "Username")]
    [InlineData("valid", "", "FullName")]
    [InlineData("valid", "   ", "FullName")]
    public async Task CreateOrUpdate_BlankIdentity_IsRejected(string username, string fullName, string field)
    {
        await Expect.InvalidAsync(field, () => _app.Users.CreateAsync(NewUser(username, fullName)));
        await Expect.InvalidAsync(field, () => _app.Users.UpdateAsync(_app.StaffId, NewUser(username, fullName, null)));
    }

    [Fact]
    [Trait("AC", "USR-02")]
    public async Task Update_ReplacesShopsAndPermissions_AndAppliesImmediately()
    {
        Assert.False(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Stock, Access.Read));

        await _app.Users.UpdateAsync(_app.StaffId, NewUser("staff", "Sara", null, [_app.ShopB]));

        Assert.True(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Stock, Access.Read));
        Assert.False(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Pos, Access.Read));
        Assert.Equal([_app.ShopB], await _app.Permissions.AllowedShopIdsAsync(_app.StaffId));
    }

    [Fact]
    [Trait("AC", "USR-02")]
    public async Task Update_NewPassword_RehashesAndShortIsRejected()
    {
        await Expect.InvalidAsync("Password", () => _app.Users.UpdateAsync(_app.StaffId, NewUser("staff", "S", "short")));
        _app.Db.ChangeTracker.Clear();

        await _app.Users.UpdateAsync(_app.StaffId, NewUser("staff", "S", "another-password"));

        Assert.Equal(_app.Hasher.Hash("another-password"), (await _app.Saved().Users.SingleAsync(u => u.Id == _app.StaffId)).PasswordHash);
    }

    [Fact]
    [Trait("AC", "USR-02")]
    public async Task CreateOrUpdate_UnknownShop_IsRejected()
    {
        await Expect.InvalidAsync("ShopIds", () => _app.Users.CreateAsync(NewUser(shops: [9999])));
        await Expect.InvalidAsync("ShopIds", () => _app.Users.UpdateAsync(_app.StaffId, NewUser("staff", "S", null, [9999])));
    }

    [Fact]
    [Trait("AC", "USR-02")]
    public async Task Update_DuplicateUsernameOrUnknown_IsRejected()
    {
        await Expect.InvalidAsync("Username", () => _app.Users.UpdateAsync(_app.StaffId, NewUser("admin", "S", null)));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Users.UpdateAsync(9999, NewUser()));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Users.GetAsync(9999));
    }

    [Fact]
    [Trait("AC", "USR-03")]
    public async Task Deactivate_Standard_RevokesSessions()
    {
        var login = await _app.Auth.LoginAsync(new("staff", TestApp.Password));

        await _app.Users.DeactivateAsync(_app.StaffId);

        var db = _app.Saved();
        Assert.False((await db.Users.SingleAsync(u => u.Id == _app.StaffId)).IsActive);
        Assert.NotNull((await db.RefreshTokens.SingleAsync(t => t.Token == RefreshTokenHash.Of(login.RefreshToken))).RevokedAt);
    }

    [Fact]
    [Trait("AC", "USR-03")]
    public async Task Deactivate_AdminOrUnknown_IsRefused()
    {
        await Assert.ThrowsAsync<ConflictException>(() => _app.Users.DeactivateAsync(_app.AdminId));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Users.DeactivateAsync(9999));
    }

    [Fact]
    [Trait("AC", "USR-01")]
    public async Task QueryAndExport_ShowShopNames()
    {
        var rows = await _app.Users.QueryAsync(new QueryRequest { Sort = [new SortRule { Field = "username" }] });
        Assert.Equal("All shops", rows.Items[0].Shops);
        Assert.Equal("Main Street", rows.Items[1].Shops);
        Assert.NotEmpty(await _app.Users.ExportAsync(new QueryRequest()));
    }

    [Fact]
    [Trait("AC", "SET-01")]
    public async Task Settings_Admin_ChangesAndServesCurrency()
    {
        Assert.Equal("PKR", (await _app.Settings.GetAsync()).Currency.Code);

        var first = await _app.Settings.UpdateAsync(new(" usd "));
        var second = await _app.Settings.UpdateAsync(new("JPY"));

        Assert.Equal("USD", first.Currency.Code);
        Assert.Equal(0, second.Currency.Decimals);
        Assert.Equal("JPY", (await _app.Settings.GetAsync()).Currency.Code);
    }

    [Theory]
    [Trait("AC", "SET-01")]
    [InlineData("XXX")]
    [InlineData("")]
    public Task Settings_UnlistedCode_IsRejected(string code)
        => Expect.InvalidAsync("CurrencyCode", () => _app.Settings.UpdateAsync(new(code)));

    [Fact]
    [Trait("AC", "SET-01")]
    public Task Settings_NotAdmin_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Settings.UpdateAsync(new("USD")));
    }

    [Fact]
    [Trait("AC", "AUD-01")]
    public async Task SensitiveActions_ReachTheAuditTrail()
    {
        // Each call clears the tracker, because in production every request has its own context.
        var invoice = await _app.SellAsync(_app.AcmeId);
        _app.Saved();
        await _app.Sales.VoidAsync(invoice.Id, new("Wrong item"));
        _app.Saved();
        await _app.Stock.AdjustAsync(new(_app.ShopA, _app.LaptopId, 1, "Count"));
        _app.Saved();
        await _app.Users.UpdateAsync(_app.StaffId, NewUser("staff", "S", null));
        _app.Saved();
        await _app.Settings.UpdateAsync(new("USD"));

        var actions = await _app.Saved().AuditLogs.Select(a => new { a.Action, a.Module, a.Username }).ToListAsync();

        Assert.Contains(actions, a => a.Action == AuditAction.Create && a.Module == Module.Pos && a.Username == "admin");
        Assert.Contains(actions, a => a.Action == AuditAction.Void && a.Module == Module.Invoices);
        Assert.Contains(actions, a => a.Action == AuditAction.Update && a.Module == Module.Stock);
        Assert.Contains(actions, a => a.Action == AuditAction.PermissionChange && a.Module == Module.Users);
        Assert.Contains(actions, a => a.Action == AuditAction.Update && a.Module == Module.Settings);
    }

    [Fact]
    [Trait("AC", "AUD-01")]
    public async Task Audit_LongSummary_IsTrimmed()
    {
        await _app.Audit.LogAsync(Module.Stock, AuditAction.Login, "X", summary: new string('s', 5000));
        Assert.Equal(1000, (await _app.Saved().AuditLogs.SingleAsync()).Summary!.Length);
    }

    [Fact]
    [Trait("AC", "AUD-02")]
    public async Task AuditLog_QueryAndExport_Work()
    {
        await _app.Audit.LogAsync(Module.Stock, AuditAction.Login, "X", shopId: _app.ShopA);

        var rows = await _app.AuditLog.QueryAsync(new QueryRequest());

        Assert.Equal("Main Street", rows.Items.Single().ShopName);
        Assert.NotEmpty(await _app.AuditLog.ExportAsync(new QueryRequest()));
    }
}

public sealed class BooksTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    [Fact]
    [Trait("AC", "LED-01")]
    public async Task CustomerLedger_RunsInDateOrder_WithOpeningAndClosing()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-10), 100m, 40m);
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-2), 50m);

        var all = await _app.Ledgers.CustomerLedgerAsync(_app.AcmeId, null, null, null);
        Assert.Equal(0m, all.Opening);
        Assert.Equal(110m, all.Closing);
        Assert.Equal([100m, 60m, 110m], all.Rows.Select(r => r.Balance).OrderBy(_ => 0));

        var ranged = await _app.Ledgers.CustomerLedgerAsync(_app.AcmeId, null, TestApp.Now.AddDays(-5), TestApp.Now);
        Assert.Equal(60m, ranged.Opening);
        Assert.Equal(110m, ranged.Closing);
        Assert.Single(ranged.Rows);
    }

    [Fact]
    [Trait("AC", "LED-01")]
    public async Task SupplierLedger_RunsBillsAndPayments()
    {
        _app.AddBill(TestApp.Now.AddDays(-3), 200m, 50m);

        var ledger = await _app.Ledgers.SupplierLedgerAsync(_app.SupplierId, null, null, null);

        Assert.Equal("Blue Chip", ledger.PartyName);
        Assert.Equal(150m, ledger.Closing);
    }

    [Fact]
    [Trait("AC", "LED-01")]
    public async Task Ledger_UnknownParty_IsEmptyWithAGenericName()
    {
        Assert.Equal("Customer", (await _app.Ledgers.CustomerLedgerAsync(9999, null, null, null)).PartyName);
        Assert.Equal("Supplier", (await _app.Ledgers.SupplierLedgerAsync(9999, null, null, null)).PartyName);
    }

    [Fact]
    [Trait("AC", "LED-02")]
    public async Task LedgerClosing_EqualsPartyBalance_IncludingVoids()
    {
        await _app.SellAsync(_app.AcmeId, qty: 2, paid: 50m);
        var voided = await _app.SellAsync(_app.AcmeId, paid: 10m);
        await _app.Sales.VoidAsync(voided.Id, new("x"));
        _app.AddBill(TestApp.Now, 90m, 10m);

        Assert.Equal((await _app.Customers.GetAsync(_app.AcmeId)).Receivable, (await _app.Ledgers.CustomerLedgerAsync(_app.AcmeId, null, null, null)).Closing, 2);
        Assert.Equal((await _app.Suppliers.GetAsync(_app.SupplierId)).Payable, (await _app.Ledgers.SupplierLedgerAsync(_app.SupplierId, null, null, null)).Closing, 2);
    }

    [Theory]
    [Trait("AC", "AGE-01")]
    [InlineData(-1, 0)]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(30, 1)]
    [InlineData(31, 2)]
    [InlineData(60, 2)]
    [InlineData(61, 3)]
    [InlineData(90, 3)]
    [InlineData(91, 4)]
    public async Task Ageing_EachBoundary_FallsInTheRightBucket(int age, int bucket)
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-age), 100m);

        // A negative age is a future-dated document, so it is read as at that later date.
        var request = new QueryRequest { ToDate = age < 0 ? TestApp.Now.AddDays(-age) : null };
        var summary = (await _app.Ledgers.CustomerAgeingAsync(request, invoiceWise: true)).Summary;

        decimal[] buckets = [summary.Current, summary.Days1To30, summary.Days31To60, summary.Days61To90, summary.Over90];
        Assert.Equal(100m, buckets[bucket]);
        Assert.Equal(100m, summary.Total);
    }

    [Fact]
    [Trait("AC", "AGE-02")]
    public async Task Ageing_PartyAndDocumentViews_HaveEqualTotals()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-5), 100m, 25m);
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-40), 60m);
        _app.AddBill(TestApp.Now.AddDays(-70), 80m);

        var party = await _app.Ledgers.CustomerAgeingAsync(new QueryRequest(), invoiceWise: false);
        var document = await _app.Ledgers.CustomerAgeingAsync(new QueryRequest(), invoiceWise: true);
        var payable = await _app.Ledgers.SupplierAgeingAsync(new QueryRequest(), invoiceWise: false);

        Assert.Equal(135m, party.Summary.Total);
        Assert.Equal(party.Summary, document.Summary);
        Assert.Single(party.Rows.Items);
        Assert.Equal(2, document.Rows.Items.Count);
        Assert.Equal(80m, payable.Summary.Days61To90);
    }

    [Fact]
    [Trait("AC", "AGE-03")]
    public async Task Ageing_AsAtADate_ExcludesLaterDocuments()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-30), 100m);
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 500m);
        _app.AddBill(TestApp.Now.AddDays(-30), 70m);
        _app.AddBill(TestApp.Now, 900m);

        var asAt = new QueryRequest { ToDate = TestApp.Now.AddDays(-10) };

        Assert.Equal(100m, (await _app.Ledgers.CustomerAgeingAsync(asAt, false)).Summary.Total);
        Assert.Equal(70m, (await _app.Ledgers.SupplierAgeingAsync(asAt, false)).Summary.Total);
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task ExportAgeing_ReturnsWorkbooks()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 10m);
        _app.AddBill(TestApp.Now, 10m);
        Assert.NotEmpty(await _app.Ledgers.ExportAgeingAsync(new QueryRequest(), true, true));
        Assert.NotEmpty(await _app.Ledgers.ExportAgeingAsync(new QueryRequest(), false, false));
    }

    private static ReportFilter Month => new(null, TestApp.Now.AddDays(-20), TestApp.Now);

    private async Task SeedBooksAsync()
    {
        await _app.SellAsync(_app.AcmeId, qty: 2, paid: 50m);
        var voided = await _app.SellAsync(_app.AcmeId);
        await _app.Sales.VoidAsync(voided.Id, new("x"));
        await _app.Expenses.CreateAsync(new(_app.ShopA, _app.ExpenseCategoryId, TestApp.Now, 30m, PaymentMethod.Cash, null));
        await _app.Purchases.CreateAsync(new(_app.ShopA, _app.SupplierId, TestApp.Now, 20m, PaymentMethod.Bank, null, [new(_app.MouseId, 4, 25m)]));
        await _app.PettyCash.CreateAsync(new(_app.ShopA, TestApp.Now, PettyCashDirection.In, 15m, "float"));
    }

    [Fact]
    [Trait("AC", "RPT-01")]
    public async Task ProfitAndLoss_ExcludesVoids_AndNets()
    {
        await SeedBooksAsync();

        var report = await _app.Reports.ProfitAndLossAsync(Month);

        Assert.Equal(200m, report.Revenue);
        Assert.Equal(120m, report.Cogs);
        Assert.Equal(80m, report.GrossProfit);
        Assert.Equal(30m, report.Expenses);
        Assert.Equal(50m, report.NetProfit);
        Assert.Equal("Rent", report.ExpenseLines.Single().Name);
    }

    [Fact]
    [Trait("AC", "RPT-02")]
    public async Task BalanceSheet_AssetsEqualLiabilitiesPlusEquity()
    {
        await SeedBooksAsync();

        var sheet = await _app.Reports.BalanceSheetAsync(new ReportFilter(null, null, null));

        Assert.Equal(sheet.TotalAssets, sheet.TotalLiabilities + sheet.OwnerEquity, 2);
        Assert.Equal(sheet.TotalAssets, sheet.CashAndBank + sheet.Receivables + sheet.Inventory, 2);
        Assert.Equal(150m, sheet.Receivables, 2);
        Assert.Equal(80m, sheet.Payables, 2);
    }

    [Fact]
    [Trait("AC", "RPT-03")]
    public async Task AgeingTotals_EqualBalanceSheet()
    {
        await SeedBooksAsync();
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-45), 75m, 5m);

        var sheet = await _app.Reports.BalanceSheetAsync(new ReportFilter(null, null, null));

        Assert.Equal(sheet.Receivables, (await _app.Ledgers.CustomerAgeingAsync(new QueryRequest(), false)).Summary.Total, 2);
        Assert.Equal(sheet.Payables, (await _app.Ledgers.SupplierAgeingAsync(new QueryRequest(), false)).Summary.Total, 2);
    }

    [Fact]
    [Trait("AC", "RPT-04")]
    public async Task CashFlow_OpeningPlusInLessOutEqualsClosing()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-40), 100m, 100m);
        await SeedBooksAsync();
        await _app.PettyCash.CreateAsync(new(_app.ShopA, TestApp.Now, PettyCashDirection.Out, 1m, "out"));

        var flow = await _app.Reports.CashFlowAsync(Month);

        Assert.Equal(100m, flow.OpeningCash);
        Assert.Equal(50m, flow.CustomerReceipts);
        Assert.Equal(15m, flow.OtherCashIn);
        Assert.Equal(20m, flow.SupplierPayments);
        Assert.Equal(30m, flow.ExpensePayments);
        Assert.Equal(1m, flow.OtherCashOut);
        Assert.Equal(flow.OpeningCash + flow.TotalInflow - flow.TotalOutflow, flow.ClosingCash);
        var sheet = await _app.Reports.BalanceSheetAsync(new ReportFilter(null, null, null));
        Assert.Equal(sheet.CashAndBank, flow.ClosingCash, 2);
    }

    [Fact]
    [Trait("AC", "RPT-05")]
    public async Task Daily_BucketsByDay_AndComputesNet()
    {
        await SeedBooksAsync();

        var rows = await _app.Reports.DailyAsync(new ReportFilter(null, TestApp.Now.AddDays(-1), TestApp.Now));

        Assert.Equal(2, rows.Count);
        var today = rows[0];
        Assert.Equal("15 Jun 2026", today.Period);
        Assert.Equal(1, today.InvoiceCount);
        Assert.Equal(50m, today.NetProfit);
        Assert.Equal(50m, today.Receipts);
        Assert.Equal(100m, today.Purchases);
    }

    [Fact]
    [Trait("AC", "RPT-05")]
    public async Task Monthly_DefaultRange_BucketsByMonth_AndExports()
    {
        await SeedBooksAsync();

        var rows = await _app.Reports.MonthlyAsync(new ReportFilter(null, null, null));

        Assert.Equal("Jun 2026", rows[0].Period);
        Assert.InRange(rows.Count, 12, 13);
        Assert.NotEmpty(await _app.Reports.ExportSummaryAsync(new ReportFilter(null, null, null), monthly: true));
    }

    [Fact]
    [Trait("AC", "RPT-05")]
    public async Task ReversedRange_DoesNotFail()
    {
        var report = await _app.Reports.ProfitAndLossAsync(new ReportFilter(null, TestApp.Now, TestApp.Now.AddDays(-9)));
        Assert.True(report.From < report.To);
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public async Task Reports_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Reports.ProfitAndLossAsync(new ReportFilter(_app.ShopB, null, null)));
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Reports.BalanceSheetAsync(new ReportFilter(_app.ShopB, null, null)));
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Reports.CashFlowAsync(new ReportFilter(_app.ShopB, null, null)));
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Reports.DailyAsync(new ReportFilter(_app.ShopB, null, null)));
    }

    [Fact]
    [Trait("AC", "DSH-01")]
    public async Task Dashboard_ReversedRange_IsSwapped_ShortRangeByDay()
    {
        await SeedBooksAsync();

        var result = await _app.Dashboard.GetAsync(null, TestApp.Now, TestApp.Now.AddDays(-9));

        Assert.Equal("day", result.Range.Granularity);
        Assert.Equal(10, result.Range.Days);
        Assert.Equal(200m, result.Kpi.PeriodSales);
        Assert.Equal(200m, result.Kpi.TodaySales);
        Assert.Equal(80m, result.Kpi.GrossProfit);
        Assert.Equal(30m, result.Kpi.Expenses);
        Assert.Equal(10, result.DailySales.Count);
        Assert.Equal("Laptops", result.SalesByCategory.Single().Label);
        Assert.Equal(150m, result.ReceivableAgeing.Total);
        Assert.Single(result.RecentInvoices, i => i.Status != InvoiceStatus.Void);
    }

    [Fact]
    [Trait("AC", "DSH-01")]
    public async Task Dashboard_LongRange_BucketsByMonth()
    {
        var result = await _app.Dashboard.GetAsync(null, TestApp.Now.AddDays(-100), TestApp.Now);

        Assert.Equal("month", result.Range.Granularity);
        Assert.Equal(4, result.SalesVsExpenses.Count);
    }

    [Fact]
    [Trait("AC", "DSH-01")]
    public async Task Dashboard_Scope_RefusesOtherShop_AndCountsOwnOnly()
    {
        await _app.SellAsync(_app.AcmeId, shopId: _app.ShopB);
        _app.AsStaff();

        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Dashboard.GetAsync(_app.ShopB, null, null));
        Assert.Equal(0m, (await _app.Dashboard.GetAsync(null, null, null)).Kpi.PeriodSales);

        _app.AsNobody();
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Dashboard.GetAsync(null, null, null));
    }

    [Fact]
    [Trait("AC", "DOC-01")]
    public async Task Numbers_ArePerShopPerMonthAndIncrease()
    {
        Assert.Equal("MAIN-202606-0001", (await _app.SellAsync(_app.AcmeId)).InvoiceNo);
        Assert.Equal("MAIN-202606-0002", (await _app.SellAsync(_app.AcmeId)).InvoiceNo);
        Assert.Equal("MALL-202606-0001", (await _app.SellAsync(_app.AcmeId, shopId: _app.ShopB)).InvoiceNo);

        _app.Clock.UtcNow = TestApp.Now.AddMonths(1);
        Assert.Equal("MAIN-202607-0001", (await _app.SellAsync(_app.AcmeId)).InvoiceNo);
    }

    [Fact]
    [Trait("AC", "XLS-01")]
    public async Task Excel_HonoursColumnWhitelist_AndWritesFormulasAsText()
    {
        var customer = await _app.Customers.CreateAsync(new("=HYPERLINK(\"http://evil\",\"x\")", null, null, true));

        var bytes = await _app.Customers.ExportAsync(new QueryRequest
        {
            Columns = ["name", "receivable", "secretColumn"],
            Filters = [new FilterRule { Field = "id", Operator = FilterOperator.Equals, Value = customer.Id.ToString(System.Globalization.CultureInfo.InvariantCulture) }],
        });

        using var workbook = new XLWorkbook(new MemoryStream(bytes));
        var sheet = workbook.Worksheet(1);
        Assert.Equal("Customer", sheet.Cell(1, 1).GetString());
        Assert.Equal("Receivable", sheet.Cell(1, 2).GetString());
        Assert.True(sheet.Cell(1, 3).IsEmpty());
        Assert.False(sheet.Cell(2, 1).HasFormula);
        Assert.Equal("=HYPERLINK(\"http://evil\",\"x\")", sheet.Cell(2, 1).GetString());
    }

    [Fact]
    [Trait("AC", "XLS-01")]
    public void Excel_EveryValueType_IsWritten()
    {
        var spec = new QuerySpec<ExcelRow>()
            .Text("text", r => r.Text, "T")
            .Map("nil", r => r.Nil, "N")
            .Map("money", r => r.Money, "M")
            .Map("real", r => r.Real, "R")
            .Map("count", r => r.Count, "C")
            .Map("date", r => r.Date, "D")
            .Map("flag", r => r.Flag, "F")
            .Map("state", r => r.State, "S");

        var bytes = _app.Excel.Build("bad[]:name*that/is\\much-too-long-for-excel-tabs", [new ExcelRow("a", null, 1.5m, 2.5d, 3, TestApp.Now, true, RowState.Retired)], spec, []);

        using var workbook = new XLWorkbook(new MemoryStream(bytes));
        var sheet = workbook.Worksheet(1);
        Assert.True(sheet.Name.Length <= 31);
        Assert.DoesNotContain('[', sheet.Name);
        Assert.Equal("Yes", sheet.Cell(2, 7).GetString());
        Assert.Equal("Retired", sheet.Cell(2, 8).GetString());
    }

    [Fact]
    [Trait("AC", "XLS-01")]
    public void Excel_BlankSheetName_FallsBack()
    {
        var spec = new QuerySpec<ExcelRow>().Text("text", r => r.Text, "T");
        using var workbook = new XLWorkbook(new MemoryStream(_app.Excel.Build("[]", [], spec, [])));
        Assert.Equal("Export", workbook.Worksheet(1).Name);
    }

    public sealed record ExcelRow(string Text, string? Nil, decimal Money, double Real, int Count, DateTime Date, bool Flag, RowState State);
}
