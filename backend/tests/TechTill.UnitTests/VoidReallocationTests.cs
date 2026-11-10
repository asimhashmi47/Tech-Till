using TechTill.Application.Features.Sales;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>Voiding an invoice settled by an unlinked receipt stranded that money (F17).</summary>
public class VoidReallocationTests
{
    private static Task<CustomerPaymentDto> ReceiveOnAccountAsync(TestApp app, decimal amount)
        => app.Sales.ReceiveAsync(new CreateCustomerPaymentRequest(app.ShopA, app.AcmeId, null, TestApp.Now, amount, PaymentMethod.Bank, null));

    [Fact]
    [Trait("AC", "SALE-18")]
    public async Task Voiding_MovesAnOnAccountReceipt_ToTheNextOpenInvoice()
    {
        using var app = new TestApp();
        var first = await app.SellAsync(app.AcmeId, paid: 0m, method: PaymentMethod.Credit);
        var second = await app.SellAsync(app.AcmeId, paid: 0m, method: PaymentMethod.Credit);
        await ReceiveOnAccountAsync(app, 100m);
        Assert.Equal(100m, app.Saved().SalesInvoices.Single(i => i.Id == first.Id).PaidAmount);

        await app.Sales.VoidAsync(first.Id, new VoidInvoiceRequest("wrong customer"));

        var moved = app.Saved().SalesInvoices.Single(i => i.Id == second.Id);
        Assert.Equal(100m, moved.PaidAmount);
        Assert.Equal(InvoiceStatus.Paid, moved.Status);
        Assert.Equal(0m, (await app.Ledgers.CustomerLedgerAsync(app.AcmeId, app.ShopA, null, null)).Closing);
    }

    [Fact]
    [Trait("AC", "SALE-18")]
    public async Task Voiding_KeepsLinkedReceiptsReversed_AndOnlyMovesTheUnlinkedPart()
    {
        using var app = new TestApp();
        var first = await app.SellAsync(app.AcmeId, paid: 0m, method: PaymentMethod.Credit);
        var second = await app.SellAsync(app.AcmeId, paid: 0m, method: PaymentMethod.Credit);
        await app.Sales.ReceiveAsync(new CreateCustomerPaymentRequest(app.ShopA, app.AcmeId, first.Id, TestApp.Now, 40m, PaymentMethod.Card, null));
        await ReceiveOnAccountAsync(app, 60m);

        await app.Sales.VoidAsync(first.Id, new VoidInvoiceRequest("returned"));

        Assert.Equal(60m, app.Saved().SalesInvoices.Single(i => i.Id == second.Id).PaidAmount);
        Assert.Equal(40m, (await app.Ledgers.CustomerLedgerAsync(app.AcmeId, app.ShopA, null, null)).Closing);
    }
}
