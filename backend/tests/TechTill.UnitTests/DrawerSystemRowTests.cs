using TechTill.Application.Common.Exceptions;
using TechTill.Application.Features.Money;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>A cash sale's drawer row could be deleted, so the drawer stopped matching sales (F18).</summary>
public class DrawerSystemRowTests
{
    [Fact]
    [Trait("AC", "PET-04")]
    public async Task ARowWrittenByASale_CannotBeDeleted()
    {
        using var app = new TestApp();
        var invoice = await app.SellAsync(app.WalkInId);
        var row = app.Saved().PettyCashEntries.Single(p => p.Note == $"Cash sale {invoice.InvoiceNo}");
        var before = await app.PettyCash.BalanceAsync(app.ShopA);

        await Assert.ThrowsAsync<ConflictException>(() => app.PettyCash.DeleteAsync(row.Id));

        Assert.Equal(before, await app.PettyCash.BalanceAsync(app.ShopA));
    }

    [Fact]
    [Trait("AC", "PET-04")]
    public async Task AManualRow_CanStillBeDeleted()
    {
        using var app = new TestApp();
        var row = await app.PettyCash.CreateAsync(new SavePettyCashRequest(app.ShopA, TestApp.Now, PettyCashDirection.In, 50m, "float"));

        await app.PettyCash.DeleteAsync(row.Id);

        Assert.Equal(0m, await app.PettyCash.BalanceAsync(app.ShopA));
    }
}
