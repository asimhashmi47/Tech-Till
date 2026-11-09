using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;

namespace TechTill.IntegrationTests;

public static class Till
{
    public static async Task<(long Shop, long Customer, long Product, HttpClient Admin)> ArrangeAsync(ApiFactory api, int stock = 10, decimal price = 100m)
    {
        var admin = await api.AsAsync("admin");
        var shop = await ShopAsync(api, "MAIN");
        var category = await api.DbAsync(db => db.Categories.Select(c => c.Id).FirstAsync());
        var sku = "RACE-" + Guid.NewGuid().ToString("N")[..10];
        var product = (await admin.PostAsJsonAsync("/api/products", new { sku, name = sku, categoryId = category, costPrice = 60m, salePrice = price, reorderLevel = 0, isActive = true }).ExpectOkAsync()).Id();
        var customer = (await admin.PostAsJsonAsync("/api/customers", new { name = "Race " + sku, isActive = true }).ExpectOkAsync()).Id();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/stock/opening", new { shopId = shop, productId = product, qty = stock })).StatusCode);
        return (shop, customer, product, admin);
    }

    public static Task<long> ShopAsync(ApiFactory api, string code)
        => api.DbAsync(db => db.Shops.Where(s => s.Code == code).Select(s => s.Id).FirstAsync());

    public static object Sale(long shop, long customer, long product, int qty = 1, decimal price = 100m)
        => new { shopId = shop, customerId = customer, discount = 0m, paidNow = qty * price, paymentMethod = "Cash", items = new[] { new { productId = product, qty, unitPrice = price } } };

    public static Task<int> QtyAsync(ApiFactory api, long shop, long product)
        => api.DbAsync(db => db.StockLevels.Where(s => s.ShopId == shop && s.ProductId == product).Select(s => s.Qty).FirstAsync());
}

/// <summary>The stock check used to run outside the transaction, so parallel sales oversold (F03).</summary>
[Collection("api")]
public class StockRaceTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    [Fact]
    [Trait("AC", "STK-07")]
    public async Task ParallelSales_NeverSellMoreThanIsOnHand()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);

        var results = await Task.WhenAll(Enumerable.Range(0, 40).Select(_ => admin.PostAsJsonAsync("/api/pos/sale", Till.Sale(shop, customer, product))));

        Assert.Equal(5, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(35, results.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
        Assert.Equal(0, await Till.QtyAsync(Api, shop, product));
        Assert.Equal(5, await Api.DbAsync(db => db.SalesItems.CountAsync(i => i.ProductId == product)));
    }

    [Fact]
    [Trait("AC", "STK-07")]
    public async Task ParallelAdjustments_NeverGoNegative()
    {
        var (shop, _, product, admin) = await Till.ArrangeAsync(Api, stock: 5);

        var results = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => admin.PostAsJsonAsync("/api/stock/adjust", new { shopId = shop, productId = product, qty = -1, reason = "race" })));

        Assert.Equal(5, results.Count(r => r.IsSuccessStatusCode));
        Assert.Equal(0, await Till.QtyAsync(Api, shop, product));
    }

    [Fact]
    [Trait("AC", "STK-07")]
    public async Task ParallelTransfers_NeverMoveMoreThanIsOnHand()
    {
        var (shop, _, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var other = await Till.ShopAsync(Api, "MALL");

        var results = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => admin.PostAsJsonAsync("/api/stock/transfer", new { fromShopId = shop, toShopId = other, productId = product, qty = 1 })));

        Assert.Equal(5, results.Count(r => r.IsSuccessStatusCode));
        Assert.Equal(0, await Till.QtyAsync(Api, shop, product));
        Assert.Equal(5, await Till.QtyAsync(Api, other, product));
    }
}
