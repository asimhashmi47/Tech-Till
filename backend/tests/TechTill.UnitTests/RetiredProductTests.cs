namespace TechTill.UnitTests;

/// <summary>A product marked inactive could still be sold through the API (F20).</summary>
public class RetiredProductTests
{
    [Fact]
    [Trait("AC", "SALE-19")]
    public async Task AnInactiveProduct_CannotBeSold()
    {
        using var app = new TestApp();
        app.Saved().Products.Single(p => p.Id == app.LaptopId).IsActive = false;
        await app.Db.SaveChangesAsync();

        await Expect.InvalidAsync("Items", () => app.SellAsync(app.WalkInId));
        Assert.Equal(10, app.QtyOf(app.ShopA, app.LaptopId));
    }
}
