using TechTill.Application.Features.Sales;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>A cashier used to be able to sell a 100 item for 0.01 (F06).</summary>
public class PricePolicyTests
{
    private static Task<InvoiceDetailDto> SellAsync(TestApp app, decimal price, decimal discount = 0m, int qty = 1)
        => app.Sales.CreateSaleAsync(new CreateSaleRequest(
            app.ShopA,
            app.AcmeId,
            discount,
            0m,
            PaymentMethod.Credit,
            null,
            [new SaleLineInput(app.LaptopId, qty, price)]));

    [Theory]
    [Trait("AC", "SALE-17")]
    [InlineData(0.01, 0)]
    [InlineData(89.99, 0)]
    [InlineData(100, 10.01)]
    [InlineData(95, 5.01)]
    public async Task Staff_BelowTheAllowance_IsRefused(double price, double discount)
    {
        using var app = new TestApp();
        app.AsStaff();

        await Expect.InvalidAsync("Items", () => SellAsync(app, (decimal)price, (decimal)discount));
        Assert.Equal(10, app.QtyOf(app.ShopA, app.LaptopId));
    }

    [Theory]
    [Trait("AC", "SALE-17")]
    [InlineData(90, 0)]
    [InlineData(100, 10)]
    [InlineData(95, 5)]
    [InlineData(120, 30)]
    [InlineData(150, 0)]
    public async Task Staff_WithinTheAllowance_Sells(double price, double discount)
    {
        using var app = new TestApp();
        app.AsStaff();

        var invoice = await SellAsync(app, (decimal)price, (decimal)discount);

        Assert.Equal((decimal)price - (decimal)discount, invoice.Total);
    }

    [Fact]
    [Trait("AC", "SALE-17")]
    public async Task Allowance_IsMeasuredAcrossTheWholeCart()
    {
        using var app = new TestApp();
        app.AsStaff();

        await Expect.InvalidAsync("Items", () => SellAsync(app, 89m, qty: 3));
    }

    [Fact]
    [Trait("AC", "SALE-17")]
    public async Task Owner_MaySellAtAnyPrice()
    {
        using var app = new TestApp();

        var invoice = await SellAsync(app, 0.01m);

        Assert.Equal(0.01m, invoice.Total);
    }

    [Fact]
    [Trait("AC", "SALE-17")]
    public async Task AnyOverride_RecordsListAndChargedInTheAudit()
    {
        using var app = new TestApp();
        app.AsStaff();

        await SellAsync(app, 95m);

        var entry = app.Saved().AuditLogs.Single(a => a.Module == Module.Pos && a.Action == AuditAction.Create);
        Assert.Contains("list 100.00", entry.Summary, StringComparison.Ordinal);
        Assert.Contains("charged 95.00", entry.Summary, StringComparison.Ordinal);
    }

    [Fact]
    [Trait("AC", "SALE-17")]
    public async Task ListPriceSale_DoesNotMentionAnOverride()
    {
        using var app = new TestApp();
        app.AsStaff();

        await SellAsync(app, 100m);

        var entry = app.Saved().AuditLogs.Single(a => a.Module == Module.Pos && a.Action == AuditAction.Create);
        Assert.DoesNotContain("list", entry.Summary, StringComparison.Ordinal);
    }
}
