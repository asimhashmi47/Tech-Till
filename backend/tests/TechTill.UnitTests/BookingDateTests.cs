using TechTill.Application.Features.Money;
using TechTill.Application.Features.Purchases;
using TechTill.Application.Features.Sales;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>Money could be booked on any date, 1900 included, which rewrites history (F19).</summary>
public class BookingDateTests
{
    private static Task Drawer(TestApp app, DateTime date)
        => app.PettyCash.CreateAsync(new SavePettyCashRequest(app.ShopA, date, PettyCashDirection.In, 5m, null));

    public static TheoryData<int> TooOld => new() { -40, -400 };

    [Theory]
    [Trait("AC", "DATE-01")]
    [MemberData(nameof(TooOld))]
    public async Task Staff_CannotBackdateMoreThan31Days(int days)
    {
        using var app = new TestApp();
        app.AsStaff();

        await Expect.InvalidAsync("EntryDate", () => Drawer(app, TestApp.Now.AddDays(days)));
    }

    [Fact]
    [Trait("AC", "DATE-01")]
    public async Task Staff_CanBackdateWithin31Days()
    {
        using var app = new TestApp();
        app.AsStaff();

        await Drawer(app, TestApp.Now.AddDays(-31));
    }

    [Fact]
    [Trait("AC", "DATE-01")]
    public async Task Owner_CanBackdateFarther_ButNotBefore2000()
    {
        using var app = new TestApp();

        await Drawer(app, new DateTime(2010, 3, 1, 0, 0, 0, DateTimeKind.Utc));
        await Expect.InvalidAsync("EntryDate", () => Drawer(app, new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    [Trait("AC", "DATE-01")]
    public async Task NobodyCanBookIntoTheFuture()
    {
        using var app = new TestApp();

        await Expect.InvalidAsync("EntryDate", () => Drawer(app, TestApp.Now.AddDays(3)));
    }

    [Fact]
    [Trait("AC", "DATE-01")]
    public async Task EveryMoneyRecord_HasTheSameRule()
    {
        using var app = new TestApp();
        var old = new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        app.AddInvoice(app.AcmeId, TestApp.Now.AddDays(-1), 100m);
        app.AddBill(TestApp.Now.AddDays(-1), 100m);

        await Expect.InvalidAsync("ReceivedAt", () => app.Sales.ReceiveAsync(new CreateCustomerPaymentRequest(app.ShopA, app.AcmeId, null, old, 10m, PaymentMethod.Bank, null)));
        await Expect.InvalidAsync("PaidAt", () => app.Purchases.PayAsync(new CreateSupplierPaymentRequest(app.ShopA, app.SupplierId, null, old, 10m, PaymentMethod.Bank, null)));
        await Expect.InvalidAsync("BillDate", () => app.Purchases.CreateAsync(new CreatePurchaseRequest(app.ShopA, app.SupplierId, old, 0m, PaymentMethod.Bank, null, [new PurchaseLineInput(app.LaptopId, 1, 70m)])));
        await Expect.InvalidAsync("ExpenseDate", () => app.Expenses.CreateAsync(new SaveExpenseRequest(app.ShopA, app.ExpenseCategoryId, old, 10m, PaymentMethod.Bank, null)));
    }
}
