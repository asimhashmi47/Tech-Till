using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Purchases;
using TechTill.Application.Features.Stock;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

public sealed class StockTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    [Theory]
    [Trait("AC", "STK-01")]
    [InlineData(5, StockMovementType.AdjustmentIn, 15)]
    [InlineData(-10, StockMovementType.AdjustmentOut, 0)]
    public async Task Adjust_Valid_MovesStockAndWritesMovement(int qty, StockMovementType type, int expected)
    {
        await _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, _app.LaptopId, qty, " Recount "));

        Assert.Equal(expected, _app.QtyOf(_app.ShopA, _app.LaptopId));
        var movement = await _app.Saved().StockMovements.SingleAsync(m => m.Type == type);
        Assert.Equal("Recount", movement.Reason);
    }

    [Fact]
    [Trait("AC", "STK-01")]
    public Task Adjust_Zero_IsRejected()
        => Expect.InvalidAsync("Qty", () => _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, _app.LaptopId, 0, "x")));

    [Theory]
    [Trait("AC", "STK-01")]
    [InlineData("")]
    [InlineData("  ")]
    public Task Adjust_BlankReason_IsRejected(string reason)
        => Expect.InvalidAsync("Reason", () => _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, _app.LaptopId, 1, reason)));

    [Fact]
    [Trait("AC", "STK-01")]
    public Task Adjust_BelowZero_IsRejected()
        => Expect.InvalidAsync("Qty", () => _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, _app.LaptopId, -11, "x")));

    [Fact]
    [Trait("AC", "STK-01")]
    public Task Adjust_UnknownProduct_IsNotFound()
        => Assert.ThrowsAsync<NotFoundException>(() => _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, 9999, 1, "x")));

    [Fact]
    [Trait("AC", "STK-02")]
    public async Task Transfer_Valid_MovesBetweenShops()
    {
        await _app.Stock.TransferAsync(new TransferStockRequest(_app.ShopA, _app.ShopB, _app.LaptopId, 4, null));

        Assert.Equal(6, _app.QtyOf(_app.ShopA, _app.LaptopId));
        Assert.Equal(6, _app.QtyOf(_app.ShopB, _app.LaptopId));
    }

    [Fact]
    [Trait("AC", "STK-02")]
    public Task Transfer_SameShop_IsRejected()
        => Expect.InvalidAsync("ToShopId", () => _app.Stock.TransferAsync(new TransferStockRequest(_app.ShopA, _app.ShopA, _app.LaptopId, 1, null)));

    [Theory]
    [Trait("AC", "STK-02")]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(11)]
    public Task Transfer_BadQuantity_IsRejected(int qty)
        => Expect.InvalidAsync("Qty", () => _app.Stock.TransferAsync(new TransferStockRequest(_app.ShopA, _app.ShopB, _app.LaptopId, qty, null)));

    [Fact]
    [Trait("AC", "STK-02")]
    public Task Transfer_DestinationOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Stock.TransferAsync(new TransferStockRequest(_app.ShopA, _app.ShopB, _app.LaptopId, 1, null)));
    }

    [Fact]
    [Trait("AC", "STK-03")]
    public async Task Opening_NewProductInShop_CreatesLevelThroughMovement()
    {
        await _app.Stock.SetOpeningAsync(new OpeningStockRequest(_app.ShopB, _app.MouseId, 7));
        Assert.Equal(7, _app.QtyOf(_app.ShopB, _app.MouseId));
    }

    [Fact]
    [Trait("AC", "STK-03")]
    public async Task Opening_Unchanged_WritesNothing()
    {
        var before = await _app.Db.StockMovements.CountAsync();
        await _app.Stock.SetOpeningAsync(new OpeningStockRequest(_app.ShopA, _app.LaptopId, 10));
        Assert.Equal(before, await _app.Saved().StockMovements.CountAsync());
    }

    [Fact]
    [Trait("AC", "STK-03")]
    public Task Opening_Negative_IsRejected()
        => Expect.InvalidAsync("Qty", () => _app.Stock.SetOpeningAsync(new OpeningStockRequest(_app.ShopA, _app.LaptopId, -1)));

    [Fact]
    [Trait("AC", "STK-04")]
    public async Task QuantityOnHand_AfterMixedActivity_EqualsSumOfMovements()
    {
        var invoice = await _app.SellAsync(_app.AcmeId, qty: 2);
        await _app.SellAsync(_app.AcmeId, qty: 1);
        await _app.Sales.VoidAsync(invoice.Id, new("x"));
        await _app.Stock.AdjustAsync(new AdjustStockRequest(_app.ShopA, _app.LaptopId, -1, "Damaged"));
        await _app.Stock.TransferAsync(new TransferStockRequest(_app.ShopA, _app.ShopB, _app.LaptopId, 3, "move"));
        await _app.Purchases.CreateAsync(new CreatePurchaseRequest(_app.ShopA, _app.SupplierId, TestApp.Now, 0m, PaymentMethod.Bank, null, [new PurchaseLineInput(_app.LaptopId, 4, 70m)]));

        var db = _app.Saved();
        foreach (var level in await db.StockLevels.ToListAsync())
        {
            var sum = await db.StockMovements.Where(m => m.ShopId == level.ShopId && m.ProductId == level.ProductId).SumAsync(m => m.Qty);
            Assert.Equal(level.Qty, sum);
        }
    }

    [Fact]
    [Trait("AC", "STK-05")]
    public async Task LowStock_ListsRowsAtOrBelowReorderMostUrgentFirst()
    {
        var low = await _app.Stock.LowStockAsync(null);

        Assert.Equal([2, 5], low.Select(s => s.Qty));
        Assert.All(low, s => Assert.True(s.IsLow));
    }

    [Fact]
    [Trait("AC", "STK-06")]
    public Task Purchase_OverflowingStoredQuantity_IsRejected()
        => Expect.InvalidAsync("Qty", () => _app.Purchases.CreateAsync(new CreatePurchaseRequest(
            _app.ShopA, _app.SupplierId, TestApp.Now, 0m, PaymentMethod.Bank, null,
            [new PurchaseLineInput(_app.LaptopId, int.MaxValue, 1m)])));

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task QueryLevelsAndMovements_Staff_SeeOnlyTheirShop()
    {
        _app.AsStaff();

        var levels = await _app.Stock.QueryLevelsAsync(new QueryRequest());
        var movements = await _app.Stock.QueryMovementsAsync(new QueryRequest());

        Assert.All(levels.Items, l => Assert.Equal(_app.ShopA, l.ShopId));
        Assert.All(movements.Items, m => Assert.Equal(_app.ShopA, m.ShopId));
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task Exports_ReturnWorkbooks()
    {
        Assert.NotEmpty(await _app.Stock.ExportLevelsAsync(new QueryRequest()));
        Assert.NotEmpty(await _app.Stock.ExportMovementsAsync(new QueryRequest()));
    }
}

public sealed class PurchaseTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private CreatePurchaseRequest Bill(decimal paid = 0m, int qty = 2, decimal cost = 70m, long? product = null, long? supplier = null, PaymentMethod method = PaymentMethod.Cash)
        => new(_app.ShopA, supplier ?? _app.SupplierId, TestApp.Now, paid, method, null, [new PurchaseLineInput(product ?? _app.LaptopId, qty, cost)]);

    private CreateSupplierPaymentRequest Payment(decimal amount, long? billId = null, long? supplier = null, PaymentMethod method = PaymentMethod.Cash)
        => new(_app.ShopA, supplier ?? _app.SupplierId, billId, TestApp.Now, amount, method, null);

    [Fact]
    [Trait("AC", "PUR-01")]
    public async Task Create_Valid_AddsStockUpdatesCostAndNumbers()
    {
        var bill = await _app.Purchases.CreateAsync(Bill(paid: 40m, method: PaymentMethod.Bank));

        Assert.Equal("MAIN-P202606-0001", bill.BillNo);
        Assert.Equal(140m, bill.Total);
        Assert.Equal(100m, bill.Outstanding);
        Assert.Equal(12, _app.QtyOf(_app.ShopA, _app.LaptopId));
        Assert.Equal(70m, (await _app.Saved().Products.SingleAsync(p => p.Id == _app.LaptopId)).CostPrice);
    }

    [Fact]
    [Trait("AC", "PUR-01")]
    public async Task Create_ZeroCostLine_KeepsTheExistingCost()
    {
        await _app.Purchases.CreateAsync(Bill(cost: 0m));
        Assert.Equal(60m, (await _app.Saved().Products.SingleAsync(p => p.Id == _app.LaptopId)).CostPrice);
    }

    [Theory]
    [Trait("AC", "PUR-02")]
    [InlineData(PaymentMethod.Cash, 1)]
    [InlineData(PaymentMethod.Bank, 0)]
    public async Task Create_OnlyCashPaid_WritesADrawerEntry(PaymentMethod method, int entries)
    {
        await _app.Purchases.CreateAsync(Bill(paid: 10m, method: method));
        Assert.Equal(entries, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "PUR-03")]
    public Task Create_NoLines_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Purchases.CreateAsync(new CreatePurchaseRequest(_app.ShopA, _app.SupplierId, TestApp.Now, 0m, PaymentMethod.Cash, null, [])));

    [Theory]
    [Trait("AC", "PUR-03")]
    [InlineData(0, 10)]
    [InlineData(-1, 10)]
    [InlineData(1, -1)]
    public Task Create_BadLine_IsRejected(int qty, int cost)
        => Expect.InvalidAsync("Items", () => _app.Purchases.CreateAsync(Bill(qty: qty, cost: cost)));

    [Fact]
    [Trait("AC", "PUR-03")]
    public Task Create_UnknownSupplier_IsRejected()
        => Expect.InvalidAsync("SupplierId", () => _app.Purchases.CreateAsync(Bill(supplier: 9999)));

    [Fact]
    [Trait("AC", "PUR-03")]
    public Task Create_UnknownProduct_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Purchases.CreateAsync(Bill(product: 9999)));

    [Theory]
    [Trait("AC", "PUR-03")]
    [InlineData(-1)]
    [InlineData(140.01)]
    public Task Create_PaidOutsideRange_IsRejected(double paid)
        => Expect.InvalidAsync("PaidNow", () => _app.Purchases.CreateAsync(Bill(paid: (decimal)paid)));

    [Fact]
    [Trait("AC", "PUR-03")]
    public Task Create_AmountTooLargeToCompute_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Purchases.CreateAsync(Bill(cost: decimal.MaxValue)));

    [Theory]
    [Trait("AC", "PUR-04")]
    [InlineData(0)]
    [InlineData(-1)]
    public Task Pay_NotPositive_IsRejected(int amount)
        => Expect.InvalidAsync("Amount", () => _app.Purchases.PayAsync(Payment(amount)));

    [Fact]
    [Trait("AC", "PUR-04")]
    public Task Pay_AboveBalance_IsRejected()
    {
        _app.AddBill(TestApp.Now, 100m);
        return Expect.InvalidAsync("Amount", () => _app.Purchases.PayAsync(Payment(100.01m)));
    }

    [Fact]
    [Trait("AC", "PUR-04")]
    public async Task Pay_WithoutBill_ClearsOldestFirst()
    {
        var older = _app.AddBill(TestApp.Now.AddDays(-9), 100m);
        var newer = _app.AddBill(TestApp.Now, 100m);

        await _app.Purchases.PayAsync(Payment(120m));

        var db = _app.Saved();
        Assert.Equal(100m, (await db.PurchaseBills.SingleAsync(b => b.Id == older.Id)).PaidAmount);
        Assert.Equal(20m, (await db.PurchaseBills.SingleAsync(b => b.Id == newer.Id)).PaidAmount);
        Assert.Equal(1, await db.PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "PUR-05")]
    public async Task Pay_AgainstBill_UpdatesItsBalance()
    {
        var bill = _app.AddBill(TestApp.Now, 100m);

        var payment = await _app.Purchases.PayAsync(Payment(25m, bill.Id, method: PaymentMethod.Bank));

        Assert.Equal(bill.BillNo, payment.BillNo);
        Assert.Equal(25m, (await _app.Saved().PurchaseBills.SingleAsync(b => b.Id == bill.Id)).PaidAmount);
    }

    [Fact]
    [Trait("AC", "PUR-05")]
    public async Task Pay_MoreThanTheBillOutstanding_IsRejected()
    {
        var bill = _app.AddBill(TestApp.Now, 100m);
        _app.AddBill(TestApp.Now, 500m);

        await Expect.InvalidAsync("Amount", () => _app.Purchases.PayAsync(Payment(150m, bill.Id)));
    }

    [Fact]
    [Trait("AC", "PUR-05")]
    public async Task Pay_AgainstAnotherShopsBill_IsRejected()
    {
        _app.AddBill(TestApp.Now, 100m);
        var foreign = _app.AddBill(TestApp.Now, 100m, shopId: _app.ShopB);

        await Expect.InvalidAsync("PurchaseBillId", () => _app.Purchases.PayAsync(Payment(10m, foreign.Id)));
    }

    [Fact]
    [Trait("AC", "PUR-05")]
    public async Task Pay_AgainstAnotherSuppliersBill_IsRejected()
    {
        var other = await _app.Suppliers.CreateAsync(new("Other", null, null, true));
        var bill = _app.AddBill(TestApp.Now, 100m);
        var mine = await _app.Db.PurchaseBills.SingleAsync(b => b.Id == bill.Id);
        mine.SupplierId = other.Id;
        await _app.Db.SaveChangesAsync();
        _app.AddBill(TestApp.Now, 100m);

        await Expect.InvalidAsync("PurchaseBillId", () => _app.Purchases.PayAsync(Payment(10m, bill.Id)));
    }

    [Fact]
    [Trait("AC", "PUR-05")]
    public async Task Pay_AgainstUnknownBill_IsNotFound()
    {
        _app.AddBill(TestApp.Now, 100m);
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Purchases.PayAsync(Payment(10m, 9999)));
    }

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task GetBill_OtherShop_IsNotFound()
    {
        var bill = _app.AddBill(TestApp.Now, 10m, shopId: _app.ShopB);
        _app.AsStaff();
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Purchases.GetAsync(bill.Id));
    }

    [Fact]
    [Trait("AC", "PUR-01")]
    public async Task Queries_ReturnProjectionsAndDetailLines()
    {
        var bill = await _app.Purchases.CreateAsync(Bill(paid: 10m));

        Assert.Equal(1, (await _app.Purchases.QueryAsync(new QueryRequest())).TotalCount);
        Assert.Equal(1, (await _app.Purchases.QueryPaymentsAsync(new QueryRequest())).TotalCount);
        Assert.Equal(140m, (await _app.Purchases.GetAsync(bill.Id)).Items.Single().LineTotal);
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task Exports_ReturnWorkbooks()
    {
        await _app.Purchases.CreateAsync(Bill(paid: 10m));
        Assert.NotEmpty(await _app.Purchases.ExportAsync(new QueryRequest()));
        Assert.NotEmpty(await _app.Purchases.ExportPaymentsAsync(new QueryRequest()));
    }
}
