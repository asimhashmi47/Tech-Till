using TechTill.Application.Features.Purchases;
using TechTill.Application.Features.Reports;
using TechTill.Application.Features.Sales;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>"Credit" means nothing changed hands, yet a credit receipt raised cash (F16).</summary>
public class CreditMethodTests
{
    [Fact]
    [Trait("AC", "PAY-01")]
    public async Task CustomerReceipt_MarkedCredit_IsRefused()
    {
        using var app = new TestApp();
        app.AddInvoice(app.AcmeId, TestApp.Now.AddDays(-1), 100m);

        await Expect.InvalidAsync("Method", () => app.Sales.ReceiveAsync(
            new CreateCustomerPaymentRequest(app.ShopA, app.AcmeId, null, TestApp.Now, 100m, PaymentMethod.Credit, null)));
    }

    [Fact]
    [Trait("AC", "PAY-01")]
    public async Task SupplierPayment_MarkedCredit_IsRefused()
    {
        using var app = new TestApp();
        app.AddBill(TestApp.Now.AddDays(-1), 100m);

        await Expect.InvalidAsync("Method", () => app.Purchases.PayAsync(
            new CreateSupplierPaymentRequest(app.ShopA, app.SupplierId, null, TestApp.Now, 100m, PaymentMethod.Credit, null)));
    }

    [Fact]
    [Trait("AC", "PAY-01")]
    public async Task CreditSale_WithMoneyTaken_IsRefused()
    {
        using var app = new TestApp();

        await Expect.InvalidAsync("PaidNow", () => app.SellAsync(app.AcmeId, paid: 50m, method: PaymentMethod.Credit));
    }

    [Fact]
    [Trait("AC", "PAY-01")]
    public async Task CreditPurchase_WithMoneyPaid_IsRefused()
    {
        using var app = new TestApp();

        await Expect.InvalidAsync("PaidNow", () => app.Purchases.CreateAsync(new CreatePurchaseRequest(
            app.ShopA, app.SupplierId, TestApp.Now, 70m, PaymentMethod.Credit, null, [new PurchaseLineInput(app.LaptopId, 1, 70m)])));
    }

    [Fact]
    [Trait("AC", "PAY-01")]
    public async Task AnOlderCreditReceipt_IsNotCountedAsCash()
    {
        using var app = new TestApp();
        var invoice = app.AddInvoice(app.AcmeId, TestApp.Now.AddDays(-3), 100m);
        var before = (await app.Reports.BalanceSheetAsync(new ReportFilter(null, null, null))).CashAndBank;

        app.Db.CustomerPayments.Add(new CustomerPayment
        {
            ShopId = app.ShopA,
            CustomerId = app.AcmeId,
            SalesInvoiceId = invoice.Id,
            ReceivedAt = TestApp.Now.AddDays(-2),
            Amount = 100m,
            Method = PaymentMethod.Credit,
            CreatedAt = TestApp.Now
        });
        await app.Db.SaveChangesAsync();

        Assert.Equal(before, (await app.Reports.BalanceSheetAsync(new ReportFilter(null, null, null))).CashAndBank);
    }
}
