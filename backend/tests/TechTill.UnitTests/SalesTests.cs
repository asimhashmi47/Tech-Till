using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Sales;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

public sealed class SalesTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private CreateSaleRequest Cart(
        decimal discount = 0m,
        decimal paid = 100m,
        int qty = 1,
        decimal price = 100m,
        long? customer = null,
        long? product = null,
        long? shop = null)
        => new(shop ?? _app.ShopA, customer ?? _app.AcmeId, discount, paid, PaymentMethod.Cash, null,
            [new SaleLineInput(product ?? _app.LaptopId, qty, price)]);

    [Fact]
    [Trait("AC", "SALE-01")]
    public async Task CreateSale_ValidCart_RaisesNumberedInvoiceAndMovesStock()
    {
        var invoice = await _app.SellAsync(_app.AcmeId, qty: 2);

        Assert.Equal("MAIN-202606-0001", invoice.InvoiceNo);
        Assert.Equal(200m, invoice.Total);
        Assert.Equal(8, _app.QtyOf(_app.ShopA, _app.LaptopId));

        var movement = await _app.Saved().StockMovements.SingleAsync(m => m.Type == StockMovementType.Sale);
        Assert.Equal(-2, movement.Qty);
        Assert.Equal(invoice.InvoiceNo, movement.Reference);
    }

    [Fact]
    [Trait("AC", "SALE-01")]
    public async Task CreateSale_LaterCostChange_DoesNotMoveFrozenCost()
    {
        await _app.SellAsync(_app.AcmeId);
        var product = await _app.Db.Products.SingleAsync(p => p.Id == _app.LaptopId);
        product.CostPrice = 999m;
        await _app.Db.SaveChangesAsync();

        Assert.Equal(60m, (await _app.Saved().SalesItems.SingleAsync()).UnitCost);
    }

    [Fact]
    [Trait("AC", "SALE-01")]
    public async Task CreateSale_Discount_ReducesTheTotal()
    {
        var invoice = await _app.Sales.CreateSaleAsync(Cart(discount: 10m, paid: 90m));

        Assert.Equal(100m, invoice.SubTotal);
        Assert.Equal(90m, invoice.Total);
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
    }

    [Theory]
    [Trait("AC", "SALE-02")]
    [InlineData(100, InvoiceStatus.Paid, 1)]
    [InlineData(40, InvoiceStatus.Partial, 1)]
    [InlineData(0, InvoiceStatus.Unpaid, 0)]
    public async Task CreateSale_PaidAmount_SetsStatusAndPaymentRow(int paid, InvoiceStatus status, int payments)
    {
        var invoice = await _app.Sales.CreateSaleAsync(Cart(paid: paid));

        Assert.Equal(status, invoice.Status);
        Assert.Equal(100m - paid, invoice.Outstanding);
        Assert.Equal(payments, await _app.Saved().CustomerPayments.CountAsync());
    }

    [Theory]
    [Trait("AC", "SALE-03")]
    [InlineData(PaymentMethod.Cash, 1)]
    [InlineData(PaymentMethod.Card, 0)]
    [InlineData(PaymentMethod.Bank, 0)]
    public async Task CreateSale_OnlyCash_WritesADrawerEntry(PaymentMethod method, int entries)
    {
        await _app.SellAsync(_app.AcmeId, method: method);
        Assert.Equal(entries, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "SALE-03")]
    public async Task CreateSale_UnpaidCash_WritesNoDrawerEntry()
    {
        await _app.Sales.CreateSaleAsync(Cart(paid: 0m));
        Assert.Equal(0, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "SALE-04")]
    public Task CreateSale_EmptyCart_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Sales.CreateSaleAsync(
            new CreateSaleRequest(_app.ShopA, _app.AcmeId, 0m, 0m, PaymentMethod.Cash, null, [])));

    [Theory]
    [Trait("AC", "SALE-04")]
    [InlineData(0, 100)]
    [InlineData(-1, 100)]
    [InlineData(1, -0.01)]
    public Task CreateSale_BadLine_IsRejected(int qty, double price)
        => Expect.InvalidAsync("Items", () => _app.Sales.CreateSaleAsync(Cart(qty: qty, price: (decimal)price, paid: 0m)));

    [Theory]
    [Trait("AC", "SALE-04")]
    [InlineData(-1, 0)]
    [InlineData(100.01, 0)]
    public Task CreateSale_BadDiscount_IsRejected(double discount, int paid)
        => Expect.InvalidAsync("Discount", () => _app.Sales.CreateSaleAsync(Cart(discount: (decimal)discount, paid: paid)));

    [Theory]
    [Trait("AC", "SALE-04")]
    [InlineData(-1)]
    [InlineData(100.01)]
    public Task CreateSale_PaidOutsideRange_IsRejected(double paid)
        => Expect.InvalidAsync("PaidNow", () => _app.Sales.CreateSaleAsync(Cart(paid: (decimal)paid)));

    [Fact]
    [Trait("AC", "SALE-05")]
    public Task CreateSale_MoreThanOnHand_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.SellAsync(_app.AcmeId, qty: 11));

    [Fact]
    [Trait("AC", "SALE-05")]
    public async Task CreateSale_ExactlyOnHand_Succeeds()
    {
        await _app.SellAsync(_app.AcmeId, qty: 10);
        Assert.Equal(0, _app.QtyOf(_app.ShopA, _app.LaptopId));
    }

    [Fact]
    [Trait("AC", "SALE-05")]
    public Task CreateSale_DuplicateLinesOverStock_AreSummed()
        => Expect.InvalidAsync("Items", () => _app.Sales.CreateSaleAsync(new CreateSaleRequest(
            _app.ShopA, _app.AcmeId, 0m, 0m, PaymentMethod.Cash, null,
            [new SaleLineInput(_app.LaptopId, 6, 1m), new SaleLineInput(_app.LaptopId, 5, 1m)])));

    [Fact]
    [Trait("AC", "SALE-06")]
    public Task CreateSale_WalkInUnderpaying_IsRejected()
        => Expect.InvalidAsync("PaidNow", () => _app.Sales.CreateSaleAsync(Cart(paid: 99m, customer: _app.WalkInId)));

    [Fact]
    [Trait("AC", "SALE-06")]
    public async Task CreateSale_WalkInPaidInFull_Succeeds()
        => Assert.Equal(InvoiceStatus.Paid, (await _app.Sales.CreateSaleAsync(Cart(customer: _app.WalkInId))).Status);

    [Fact]
    [Trait("AC", "SALE-07")]
    public Task CreateSale_UnknownCustomer_IsRejected()
        => Expect.InvalidAsync("CustomerId", () => _app.Sales.CreateSaleAsync(Cart(customer: 9999)));

    [Fact]
    [Trait("AC", "SALE-07")]
    public Task CreateSale_UnknownProduct_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Sales.CreateSaleAsync(Cart(product: 9999)));

    [Fact]
    [Trait("AC", "SALE-07")]
    public Task CreateSale_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Sales.CreateSaleAsync(Cart(shop: _app.ShopB)));
    }

    [Fact]
    [Trait("AC", "SALE-08")]
    public async Task Void_PaidCashInvoice_RestoresStockAndReversesMoney()
    {
        var invoice = await _app.SellAsync(_app.AcmeId, qty: 3);

        var voided = await _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("Customer returned it"));

        Assert.Equal(InvoiceStatus.Void, voided.Status);
        Assert.Equal(invoice.InvoiceNo, voided.InvoiceNo);
        Assert.Equal(0m, voided.Outstanding);
        Assert.Equal(10, _app.QtyOf(_app.ShopA, _app.LaptopId));

        var db = _app.Saved();
        Assert.True((await db.CustomerPayments.SingleAsync()).IsDeleted);
        var balance = db.PettyCashEntries.AsEnumerable().Sum(p => p.Direction == PettyCashDirection.In ? p.Amount : -p.Amount);
        Assert.Equal(0m, balance);
    }

    [Fact]
    [Trait("AC", "SALE-08")]
    public async Task Void_CardInvoice_WritesNoDrawerReversal()
    {
        var invoice = await _app.SellAsync(_app.AcmeId, method: PaymentMethod.Card);
        await _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("Mistake"));
        Assert.Equal(0, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Fact]
    [Trait("AC", "SALE-09")]
    public async Task Void_NotAdmin_IsRefused()
    {
        var invoice = await _app.SellAsync(_app.AcmeId);
        _app.AsStaff();
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("x")));
    }

    [Theory]
    [Trait("AC", "SALE-09")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Void_BlankReason_IsRejected(string reason)
    {
        var invoice = await _app.SellAsync(_app.AcmeId);
        await Expect.InvalidAsync("Reason", () => _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest(reason)));
    }

    [Fact]
    [Trait("AC", "SALE-09")]
    public async Task Void_Twice_IsAConflict()
    {
        var invoice = await _app.SellAsync(_app.AcmeId);
        await _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("x"));
        await Assert.ThrowsAsync<ConflictException>(() => _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("x")));
    }

    [Fact]
    [Trait("AC", "SALE-09")]
    public Task Void_UnknownInvoice_IsNotFound()
        => Assert.ThrowsAsync<NotFoundException>(() => _app.Sales.VoidAsync(9999, new VoidInvoiceRequest("x")));

    private CreateCustomerPaymentRequest Receipt(decimal amount, long? invoiceId = null, long? customer = null, long? shop = null, PaymentMethod method = PaymentMethod.Cash)
        => new(shop ?? _app.ShopA, customer ?? _app.AcmeId, invoiceId, TestApp.Now, amount, method, null);

    [Fact]
    [Trait("AC", "SALE-10")]
    public async Task Receive_WithoutInvoice_ClearsOldestFirst()
    {
        var older = _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-10), 100m);
        var newer = _app.AddInvoice(_app.AcmeId, TestApp.Now.AddDays(-1), 100m);

        await _app.Sales.ReceiveAsync(Receipt(130m));

        var db = _app.Saved();
        var oldInvoice = await db.SalesInvoices.SingleAsync(i => i.Id == older.Id);
        var newInvoice = await db.SalesInvoices.SingleAsync(i => i.Id == newer.Id);
        Assert.Equal(InvoiceStatus.Paid, oldInvoice.Status);
        Assert.Equal(30m, newInvoice.PaidAmount);
        Assert.Equal(InvoiceStatus.Partial, newInvoice.Status);
    }

    [Fact]
    [Trait("AC", "SALE-10")]
    public async Task Receive_Cash_WritesADrawerEntry_AndCardDoesNot()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);

        await _app.Sales.ReceiveAsync(Receipt(10m));
        await _app.Sales.ReceiveAsync(Receipt(10m, method: PaymentMethod.Card));

        Assert.Equal(1, await _app.Saved().PettyCashEntries.CountAsync());
    }

    [Theory]
    [Trait("AC", "SALE-11")]
    [InlineData(0)]
    [InlineData(-5)]
    public Task Receive_NotPositive_IsRejected(int amount)
        => Expect.InvalidAsync("Amount", () => _app.Sales.ReceiveAsync(Receipt(amount)));

    [Fact]
    [Trait("AC", "SALE-11")]
    public Task Receive_AboveWhatIsOwed_IsRejected()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        return Expect.InvalidAsync("Amount", () => _app.Sales.ReceiveAsync(Receipt(100.01m)));
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_AgainstInvoice_UpdatesItsBalance()
    {
        var invoice = _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);

        var payment = await _app.Sales.ReceiveAsync(Receipt(100m, invoice.Id));

        Assert.Equal(invoice.InvoiceNo, payment.InvoiceNo);
        Assert.Equal(InvoiceStatus.Paid, (await _app.Saved().SalesInvoices.SingleAsync(i => i.Id == invoice.Id)).Status);
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_AgainstAnotherCustomersInvoice_IsRejected()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        var other = await _app.Customers.CreateAsync(new("Other Co", null, null, true));
        var foreign = _app.AddInvoice(other.Id, TestApp.Now, 100m);

        await Expect.InvalidAsync("SalesInvoiceId", () => _app.Sales.ReceiveAsync(Receipt(50m, foreign.Id)));
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_AgainstAnotherShopsInvoice_IsRejected()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        var foreign = _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m, shopId: _app.ShopB);

        await Expect.InvalidAsync("SalesInvoiceId", () => _app.Sales.ReceiveAsync(Receipt(50m, foreign.Id)));
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_MoreThanTheInvoiceOutstanding_IsRejected()
    {
        var invoice = _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 500m);

        await Expect.InvalidAsync("Amount", () => _app.Sales.ReceiveAsync(Receipt(150m, invoice.Id)));
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_AgainstVoidInvoice_IsAConflict()
    {
        var invoice = await _app.Sales.CreateSaleAsync(Cart(paid: 0m));
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        await _app.Sales.VoidAsync(invoice.Id, new VoidInvoiceRequest("x"));

        await Assert.ThrowsAsync<ConflictException>(() => _app.Sales.ReceiveAsync(Receipt(10m, invoice.Id)));
    }

    [Fact]
    [Trait("AC", "SALE-12")]
    public async Task Receive_AgainstUnknownInvoice_IsNotFound()
    {
        _app.AddInvoice(_app.AcmeId, TestApp.Now, 100m);
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Sales.ReceiveAsync(Receipt(10m, 9999)));
    }

    [Fact]
    [Trait("AC", "SALE-13")]
    public Task CreateSale_AmountTooLargeToCompute_IsRejected()
        => Expect.InvalidAsync("Items", () => _app.Sales.CreateSaleAsync(new CreateSaleRequest(
            _app.ShopA, _app.AcmeId, 0m, 0m, PaymentMethod.Cash, null,
            [new SaleLineInput(_app.LaptopId, 2, decimal.MaxValue)])));

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task GetInvoice_OtherShop_IsNotFound()
    {
        var invoice = await _app.SellAsync(_app.AcmeId, shopId: _app.ShopB);
        _app.AsStaff();
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Sales.GetAsync(invoice.Id));
    }

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task QueryInvoices_Staff_SeesOnlyAssignedShop()
    {
        await _app.SellAsync(_app.AcmeId);
        await _app.SellAsync(_app.AcmeId, shopId: _app.ShopB);
        _app.AsStaff();

        var result = await _app.Sales.QueryAsync(new QueryRequest());

        Assert.Equal(1, result.TotalCount);
        Assert.Equal(_app.ShopA, result.Items[0].ShopId);
    }

    [Fact]
    [Trait("AC", "API-05")]
    public async Task Exports_WriteAnAuditRowAndAWorkbook()
    {
        await _app.SellAsync(_app.AcmeId);

        var invoices = await _app.Sales.ExportAsync(new QueryRequest());
        var payments = await _app.Sales.ExportPaymentsAsync(new QueryRequest());

        Assert.Equal((byte)'P', invoices[0]);
        Assert.Equal((byte)'P', payments[0]);
        Assert.Equal(2, await _app.Saved().AuditLogs.CountAsync(a => a.Action == AuditAction.Export));
    }

    [Fact]
    [Trait("AC", "SALE-10")]
    public async Task QueryPayments_ReturnsProjection()
    {
        await _app.SellAsync(_app.AcmeId);
        var result = await _app.Sales.QueryPaymentsAsync(new QueryRequest());
        Assert.Equal("Acme Traders", result.Items.Single().CustomerName);
    }
}
