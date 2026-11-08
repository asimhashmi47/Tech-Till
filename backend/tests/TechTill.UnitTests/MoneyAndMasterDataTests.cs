using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Catalog;
using TechTill.Application.Features.Money;
using TechTill.Application.Features.Parties;
using TechTill.Application.Features.Shops;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

public sealed class ExpenseTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private SaveExpenseRequest Save(decimal amount = 50m, PaymentMethod method = PaymentMethod.Cash, long? category = null, long? shop = null, string? note = "Rent")
        => new(shop ?? _app.ShopA, category ?? _app.ExpenseCategoryId, TestApp.Now, amount, method, note);

    [Theory]
    [Trait("AC", "EXP-01")]
    [InlineData(0)]
    [InlineData(-1)]
    public Task Create_NotPositive_IsRejected(int amount)
        => Expect.InvalidAsync("Amount", () => _app.Expenses.CreateAsync(Save(amount)));

    [Fact]
    [Trait("AC", "EXP-01")]
    public Task Create_UnknownCategory_IsRejected()
        => Expect.InvalidAsync("ExpenseCategoryId", () => _app.Expenses.CreateAsync(Save(category: 9999)));

    [Fact]
    [Trait("AC", "EXP-01")]
    public async Task Update_UnknownCategory_IsRejected()
    {
        var expense = await _app.Expenses.CreateAsync(Save());
        await Expect.InvalidAsync("ExpenseCategoryId", () => _app.Expenses.UpdateAsync(expense.Id, Save(category: 9999)));
    }

    [Theory]
    [Trait("AC", "EXP-02")]
    [InlineData(PaymentMethod.Cash, 1)]
    [InlineData(PaymentMethod.Card, 0)]
    public async Task Create_OnlyCash_WritesADrawerEntry(PaymentMethod method, int entries)
    {
        await _app.Expenses.CreateAsync(Save(method: method));
        Assert.Equal(entries, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "EXP-02")]
    public async Task Update_CashToCard_RemovesTheDrawerEntry()
    {
        var expense = await _app.Expenses.CreateAsync(Save());
        await _app.Expenses.UpdateAsync(expense.Id, Save(method: PaymentMethod.Card));
        Assert.Equal(0, await _app.Saved().PettyCashEntries.CountAsync(p => !p.IsDeleted));
    }

    [Fact]
    [Trait("AC", "EXP-02")]
    public async Task Update_NewAmount_RebuildsTheDrawerEntry()
    {
        var expense = await _app.Expenses.CreateAsync(Save());
        var updated = await _app.Expenses.UpdateAsync(expense.Id, Save(amount: 80m, note: null));

        Assert.Equal(80m, updated.Amount);
        Assert.Equal(80m, (await _app.Saved().PettyCashEntries.SingleAsync(p => !p.IsDeleted)).Amount);
    }

    [Fact]
    [Trait("AC", "EXP-02")]
    public async Task Delete_CashExpense_RemovesItAndItsDrawerEntry()
    {
        var expense = await _app.Expenses.CreateAsync(Save());

        await _app.Expenses.DeleteAsync(expense.Id);

        var db = _app.Saved();
        Assert.True((await db.Expenses.SingleAsync()).IsDeleted);
        Assert.Equal(0, await db.PettyCashEntries.CountAsync(p => !p.IsDeleted));
    }

    [Fact]
    [Trait("AC", "EXP-02")]
    public async Task UpdateOrDelete_Unknown_IsNotFound()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Expenses.UpdateAsync(9999, Save()));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Expenses.DeleteAsync(9999));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Expenses.GetAsync(9999));
    }

    [Fact]
    [Trait("AC", "EXP-03")]
    public Task Create_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Expenses.CreateAsync(Save(shop: _app.ShopB)));
    }

    [Fact]
    [Trait("AC", "EXP-03")]
    public async Task Staff_CannotUpdateDeleteOrSeeOtherShopsExpenses()
    {
        var expense = await _app.Expenses.CreateAsync(Save(shop: _app.ShopB));
        _app.AsStaff();

        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Expenses.UpdateAsync(expense.Id, Save()));
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Expenses.DeleteAsync(expense.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Expenses.GetAsync(expense.Id));
        Assert.Equal(0, (await _app.Expenses.QueryAsync(new QueryRequest())).TotalCount);
    }

    [Fact]
    [Trait("AC", "EXP-01")]
    public async Task Categories_RejectBlankAndDuplicate_ListActive()
    {
        await Expect.InvalidAsync("Name", () => _app.Expenses.CreateCategoryAsync(new("  ", true)));
        await Expect.InvalidAsync("Name", () => _app.Expenses.CreateCategoryAsync(new("Rent", true)));

        var created = await _app.Expenses.CreateCategoryAsync(new(" Fuel ", true));

        Assert.Equal("Fuel", created.Name);
        Assert.Contains(await _app.Expenses.CategoriesAsync(), c => c.Name == "Fuel");
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task Export_ReturnsWorkbook()
        => Assert.NotEmpty(await _app.Expenses.ExportAsync(new QueryRequest()));
}

public sealed class PettyCashTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private SavePettyCashRequest Entry(PettyCashDirection direction, decimal amount, long? shop = null, DateTime? date = null)
        => new(shop ?? _app.ShopA, date ?? TestApp.Now, direction, amount, "float");

    [Theory]
    [Trait("AC", "PET-01")]
    [InlineData(0)]
    [InlineData(-1)]
    public Task Create_NotPositive_IsRejected(int amount)
        => Expect.InvalidAsync("Amount", () => _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, amount)));

    [Fact]
    [Trait("AC", "PET-01")]
    public Task Create_CashOutOfAnEmptyDrawer_IsRejected()
        => Expect.InvalidAsync("Amount", () => _app.PettyCash.CreateAsync(Entry(PettyCashDirection.Out, 1m)));

    [Fact]
    [Trait("AC", "PET-01")]
    public async Task Create_InThenExactlyAllOut_LeavesZero()
    {
        await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 100m));
        var entry = await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.Out, 100m));

        Assert.Equal(100m, entry.CashOut);
        Assert.Equal(0m, await _app.PettyCash.BalanceAsync(_app.ShopA));
    }

    [Fact]
    [Trait("AC", "PET-01")]
    public Task Create_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 1m, _app.ShopB)));
    }

    [Fact]
    [Trait("AC", "PET-02")]
    public async Task Day_ShowsOpeningInOutAndClosing()
    {
        await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 100m, date: TestApp.Now.AddDays(-2)));
        await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 30m));
        await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.Out, 10m));

        var day = (await _app.PettyCash.DayAsync(TestApp.Now, _app.ShopA)).Single();

        Assert.Equal(100m, day.Opening);
        Assert.Equal(30m, day.CashIn);
        Assert.Equal(10m, day.CashOut);
        Assert.Equal(120m, day.Closing);
    }

    [Fact]
    [Trait("AC", "PET-03")]
    public async Task Delete_EntryOwnedByAnExpense_IsAConflict()
    {
        await _app.Expenses.CreateAsync(new(_app.ShopA, _app.ExpenseCategoryId, TestApp.Now, 5m, PaymentMethod.Cash, null));
        var id = (await _app.Saved().PettyCashEntries.SingleAsync()).Id;

        await Assert.ThrowsAsync<ConflictException>(() => _app.PettyCash.DeleteAsync(id));
    }

    [Fact]
    [Trait("AC", "PET-03")]
    public async Task Delete_ManualEntry_SoftDeletes()
    {
        var entry = await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 5m));
        await _app.PettyCash.DeleteAsync(entry.Id);
        Assert.Equal(0m, await _app.PettyCash.BalanceAsync(_app.ShopA));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.PettyCash.DeleteAsync(entry.Id));
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task QueryAndExport_Work()
    {
        await _app.PettyCash.CreateAsync(Entry(PettyCashDirection.In, 5m));
        Assert.Equal(1, (await _app.PettyCash.QueryAsync(new QueryRequest())).TotalCount);
        Assert.NotEmpty(await _app.PettyCash.ExportAsync(new QueryRequest()));
    }
}

public sealed class MasterDataTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private SaveProductRequest Product(string sku = "new-1", string name = "Monitor", long? category = null, decimal cost = 1m, decimal price = 2m, int reorder = 0, bool active = true)
        => new(sku, name, category ?? _app.CategoryId, " Dell ", cost, price, reorder, active);

    [Fact]
    [Trait("AC", "MST-01")]
    public async Task CreateProduct_Valid_NormalisesSkuAndTrims()
    {
        var product = await _app.Products.CreateAsync(Product(sku: " ab-9 ", name: " Monitor "));
        Assert.Equal("AB-9", product.Sku);
        Assert.Equal("Monitor", product.Name);
        Assert.Equal("Dell", product.Brand);
    }

    [Theory]
    [Trait("AC", "MST-01")]
    [InlineData("", "x", 1, 1, 0, "Sku")]
    [InlineData("  ", "x", 1, 1, 0, "Sku")]
    [InlineData("s", "", 1, 1, 0, "Name")]
    [InlineData("s", "x", -1, 1, 0, "CostPrice")]
    [InlineData("s", "x", 1, -1, 0, "SalePrice")]
    [InlineData("s", "x", 1, 1, -1, "ReorderLevel")]
    public Task CreateProduct_Invalid_IsRejected(string sku, string name, int cost, int price, int reorder, string field)
        => Expect.InvalidAsync(field, () => _app.Products.CreateAsync(Product(sku, name, null, cost, price, reorder)));

    [Fact]
    [Trait("AC", "MST-01")]
    public Task CreateProduct_DuplicateSku_IsRejected()
        => Expect.InvalidAsync("Sku", () => _app.Products.CreateAsync(Product(sku: "lp-1")));

    [Fact]
    [Trait("AC", "MST-01")]
    public Task CreateProduct_UnknownCategory_IsRejected()
        => Expect.InvalidAsync("CategoryId", () => _app.Products.CreateAsync(Product(category: 9999)));

    [Fact]
    [Trait("AC", "MST-01")]
    public Task UpdateProduct_UnknownCategory_IsRejected()
        => Expect.InvalidAsync("CategoryId", () => _app.Products.UpdateAsync(_app.LaptopId, Product(category: 9999)));

    [Fact]
    [Trait("AC", "MST-01")]
    public Task UpdateProduct_SkuOfAnother_IsRejected()
        => Expect.InvalidAsync("Sku", () => _app.Products.UpdateAsync(_app.LaptopId, Product(sku: "MS-1")));

    [Fact]
    [Trait("AC", "MST-01")]
    public async Task UpdateProduct_Valid_Saves()
    {
        var updated = await _app.Products.UpdateAsync(_app.LaptopId, Product(sku: "LP-1", name: "Renamed", price: 123m));
        Assert.Equal("Renamed", updated.Name);
        Assert.Equal(123m, updated.SalePrice);
    }

    [Fact]
    [Trait("AC", "MST-01")]
    public async Task Product_Unknown_IsNotFound()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Products.GetAsync(9999));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Products.UpdateAsync(9999, Product()));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Products.DeleteAsync(9999));
    }

    [Fact]
    [Trait("AC", "MST-02")]
    public async Task DeleteProduct_WithHistory_Retires()
    {
        await _app.SellAsync(_app.AcmeId);
        await _app.Products.DeleteAsync(_app.LaptopId);

        var product = await _app.Saved().Products.SingleAsync(p => p.Id == _app.LaptopId);
        Assert.False(product.IsActive);
        Assert.False(product.IsDeleted);
    }

    [Fact]
    [Trait("AC", "MST-02")]
    public async Task DeleteProduct_WithoutHistory_Removes()
    {
        await _app.Products.DeleteAsync(_app.MouseId);
        Assert.True((await _app.Saved().Products.SingleAsync(p => p.Id == _app.MouseId)).IsDeleted);
    }

    [Theory]
    [Trait("AC", "MST-03")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Category_BlankName_IsRejected(string name)
    {
        await Expect.InvalidAsync("Name", () => _app.Categories.CreateAsync(new(name, true)));
        await Expect.InvalidAsync("Name", () => _app.Categories.UpdateAsync(_app.CategoryId, new(name, true)));
    }

    [Fact]
    [Trait("AC", "MST-03")]
    public async Task Category_Duplicate_IsRejected()
    {
        var other = await _app.Categories.CreateAsync(new("Monitors", true));
        await Expect.InvalidAsync("Name", () => _app.Categories.CreateAsync(new("Laptops", true)));
        await Expect.InvalidAsync("Name", () => _app.Categories.UpdateAsync(other.Id, new("Laptops", true)));
    }

    [Fact]
    [Trait("AC", "MST-03")]
    public async Task Category_InUse_CannotBeDeleted_AndEmptyCan()
    {
        await Assert.ThrowsAsync<ConflictException>(() => _app.Categories.DeleteAsync(_app.CategoryId));

        var empty = await _app.Categories.CreateAsync(new("Empty", true));
        await _app.Categories.DeleteAsync(empty.Id);

        await Assert.ThrowsAsync<NotFoundException>(() => _app.Categories.DeleteAsync(empty.Id));
    }

    [Fact]
    [Trait("AC", "MST-03")]
    public async Task Category_UpdateQueryLookup_Work()
    {
        var updated = await _app.Categories.UpdateAsync(_app.CategoryId, new("Notebooks", true));

        Assert.Equal(2, updated.ProductCount);
        Assert.Equal(1, (await _app.Categories.QueryAsync(new QueryRequest())).TotalCount);
        Assert.Single(await _app.Categories.LookupAsync());
        Assert.NotEmpty(await _app.Categories.ExportAsync(new QueryRequest()));
    }

    [Theory]
    [Trait("AC", "MST-04")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Parties_BlankName_IsRejectedOnCreateAndUpdate(string name)
    {
        await Expect.InvalidAsync("Name", () => _app.Customers.CreateAsync(new SaveCustomerRequest(name, null, null, true)));
        await Expect.InvalidAsync("Name", () => _app.Customers.UpdateAsync(_app.AcmeId, new SaveCustomerRequest(name, null, null, true)));
        await Expect.InvalidAsync("Name", () => _app.Suppliers.CreateAsync(new SaveSupplierRequest(name, null, null, true)));
        await Expect.InvalidAsync("Name", () => _app.Suppliers.UpdateAsync(_app.SupplierId, new SaveSupplierRequest(name, null, null, true)));
    }

    [Fact]
    [Trait("AC", "MST-04")]
    public async Task Parties_CreateAndUpdate_Trim()
    {
        var customer = await _app.Customers.CreateAsync(new(" Zed ", " 1 ", " here ", true));
        var supplier = await _app.Suppliers.CreateAsync(new(" Sup ", " 2 ", " there ", true));
        Assert.Equal(("Zed", "1", "here"), (customer.Name, customer.Phone, customer.Address));
        Assert.Equal(("Sup", "2", "there"), (supplier.Name, supplier.Phone, supplier.Address));

        Assert.Equal("Zed2", (await _app.Customers.UpdateAsync(customer.Id, new("Zed2", null, null, false))).Name);
        Assert.Equal("Sup2", (await _app.Suppliers.UpdateAsync(supplier.Id, new("Sup2", null, null, false))).Name);
    }

    [Fact]
    [Trait("AC", "MST-04")]
    public async Task Parties_Unknown_IsNotFound()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Customers.GetAsync(9999));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Customers.UpdateAsync(9999, new("x", null, null, true)));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Customers.DeleteAsync(9999));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Suppliers.GetAsync(9999));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Suppliers.UpdateAsync(9999, new("x", null, null, true)));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Suppliers.DeleteAsync(9999));
    }

    [Fact]
    [Trait("AC", "MST-05")]
    public async Task DeleteCustomer_WithInvoices_Deactivates_WithoutRemoves()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 10m);
        var fresh = await _app.Customers.CreateAsync(new("Fresh", null, null, true));

        await _app.Customers.DeleteAsync(_app.AcmeId);
        await _app.Customers.DeleteAsync(fresh.Id);

        var db = _app.Saved();
        Assert.False((await db.Customers.SingleAsync(c => c.Id == _app.AcmeId)).IsActive);
        Assert.True((await db.Customers.SingleAsync(c => c.Id == fresh.Id)).IsDeleted);
    }

    [Fact]
    [Trait("AC", "MST-05")]
    public Task DeleteCustomer_WalkIn_IsAConflict()
        => Assert.ThrowsAsync<ConflictException>(() => _app.Customers.DeleteAsync(_app.WalkInId));

    [Fact]
    [Trait("AC", "MST-05")]
    public async Task DeleteSupplier_WithBills_Deactivates_WithoutRemoves()
    {
        _app.AddBill(TestApp.Now, 10m);
        var fresh = await _app.Suppliers.CreateAsync(new("Fresh", null, null, true));

        await _app.Suppliers.DeleteAsync(_app.SupplierId);
        await _app.Suppliers.DeleteAsync(fresh.Id);

        var db = _app.Saved();
        Assert.False((await db.Suppliers.SingleAsync(c => c.Id == _app.SupplierId)).IsActive);
        Assert.True((await db.Suppliers.SingleAsync(c => c.Id == fresh.Id)).IsDeleted);
    }

    [Fact]
    [Trait("AC", "MST-06")]
    public async Task PartyBalances_CountOnlyTheCallersShops()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m, shopId: _app.ShopA);
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 900m, shopId: _app.ShopB);
        _app.AddBill(TestApp.Now, 40m, shopId: _app.ShopA);
        _app.AddBill(TestApp.Now, 60m, shopId: _app.ShopB);

        Assert.Equal(1000m, (await _app.Customers.GetAsync(_app.AcmeId)).Receivable);
        Assert.Equal(100m, (await _app.Suppliers.GetAsync(_app.SupplierId)).Payable);

        _app.AsStaff();
        Assert.Equal(100m, (await _app.Customers.GetAsync(_app.AcmeId)).Receivable);
        Assert.Equal(40m, (await _app.Suppliers.GetAsync(_app.SupplierId)).Payable);
    }

    [Fact]
    [Trait("AC", "MST-06")]
    public async Task PartyQueriesLookupsAndExports_Work()
    {
        Assert.Equal(2, (await _app.Customers.QueryAsync(new QueryRequest())).TotalCount);
        Assert.Equal(1, (await _app.Suppliers.QueryAsync(new QueryRequest())).TotalCount);
        Assert.True((await _app.Customers.LookupAsync())[0].IsWalkIn);
        Assert.Single(await _app.Suppliers.LookupAsync());
        Assert.NotEmpty(await _app.Customers.ExportAsync(new QueryRequest()));
        Assert.NotEmpty(await _app.Suppliers.ExportAsync(new QueryRequest()));
    }

    [Theory]
    [Trait("AC", "MST-07")]
    [InlineData("", "Shop", "Code")]
    [InlineData("  ", "Shop", "Code")]
    [InlineData("NEW", "", "Name")]
    [InlineData("NEW", "   ", "Name")]
    public async Task Shop_BlankCodeOrName_IsRejected(string code, string name, string field)
    {
        await Expect.InvalidAsync(field, () => _app.Shops.CreateAsync(new SaveShopRequest(code, name, null, null, true)));
        await Expect.InvalidAsync(field, () => _app.Shops.UpdateAsync(_app.ShopA, new SaveShopRequest(code, name, null, null, true)));
    }

    [Fact]
    [Trait("AC", "MST-07")]
    public async Task Shop_Create_UpperCasesCode_AndRefusesDuplicates()
    {
        var shop = await _app.Shops.CreateAsync(new(" east ", "East", null, null, true));

        Assert.Equal("EAST", shop.Code);
        await Expect.InvalidAsync("Code", () => _app.Shops.CreateAsync(new("east", "Again", null, null, true)));
        await Expect.InvalidAsync("Code", () => _app.Shops.UpdateAsync(shop.Id, new("MAIN", "East", null, null, true)));
    }

    [Fact]
    [Trait("AC", "MST-07")]
    public async Task Shop_UpdateAndScopedReads_Work()
    {
        var updated = await _app.Shops.UpdateAsync(_app.ShopA, new("MAIN", "Renamed", "addr", "ph", true));
        Assert.Equal("Renamed", updated.Name);
        Assert.Equal(2, (await _app.Shops.QueryAsync(new QueryRequest())).TotalCount);
        Assert.NotEmpty(await _app.Shops.ExportAsync(new QueryRequest()));

        _app.AsStaff();
        Assert.Single(await _app.Shops.LookupAsync());
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Shops.GetAsync(_app.ShopB));
        Assert.Equal("Renamed", (await _app.Shops.GetAsync(_app.ShopA)).Name);
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Shops.UpdateAsync(9999, new("X", "Y", null, null, true)));
    }

    [Theory]
    [Trait("AC", "MST-08")]
    [InlineData("LP-", 1)]
    [InlineData("latitude", 1)]
    [InlineData("logi", 1)]
    [InlineData("zzz", 0)]
    [InlineData(null, 2)]
    public async Task PosSearch_MatchesSkuNameOrBrand(string? term, int expected)
        => Assert.Equal(expected, (await _app.Products.SearchForPosAsync(_app.ShopA, term)).Count);

    [Fact]
    [Trait("AC", "MST-08")]
    public async Task PosSearch_ShowsThatShopsStock_AndHidesInactive()
    {
        var results = await _app.Products.SearchForPosAsync(_app.ShopB, "Dell");
        Assert.Equal(2, results.Single().Qty);

        await _app.Products.UpdateAsync(_app.MouseId, Product(sku: "MS-1", active: false));
        Assert.Empty(await _app.Products.SearchForPosAsync(_app.ShopA, "Mouse"));
    }

    [Fact]
    [Trait("AC", "MST-08")]
    public Task PosSearch_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Products.SearchForPosAsync(_app.ShopB, null));
    }

    [Fact]
    [Trait("AC", "MST-08")]
    public async Task Products_QueryAndExport_CountOnlyVisibleStock()
    {
        _app.AsStaff();
        var rows = await _app.Products.QueryAsync(new QueryRequest());
        Assert.Equal(10, rows.Items.Single(p => p.Id == _app.LaptopId).TotalStock);
        Assert.NotEmpty(await _app.Products.ExportAsync(new QueryRequest()));
    }
}
