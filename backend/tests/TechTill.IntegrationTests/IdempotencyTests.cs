using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;

namespace TechTill.IntegrationTests;

/// <summary>A network retry used to bill the customer twice (F05).</summary>
[Collection("api")]
public class IdempotencyTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    private static HttpRequestMessage Request(object body, string? key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/pos/sale") { Content = JsonContent.Create(body) };
        if (key is not null)
        {
            request.Headers.Add("Idempotency-Key", key);
        }

        return request;
    }

    private Task<int> InvoicesForAsync(long product)
        => Api.DbAsync(db => db.SalesItems.CountAsync(i => i.ProductId == product));

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task SameKeyTwice_BillsOnce_AndReturnsTheSameInvoice()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var key = Guid.NewGuid().ToString();
        var body = Till.Sale(shop, customer, product);

        var first = await admin.SendAsync(Request(body, key)).ExpectOkAsync();
        var second = await admin.SendAsync(Request(body, key)).ExpectOkAsync();

        Assert.Equal(first.Id(), second.Id());
        Assert.Equal(1, await InvoicesForAsync(product));
        Assert.Equal(4, await Till.QtyAsync(Api, shop, product));
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task SameKeyInParallel_BillsOnce()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 50);
        var key = Guid.NewGuid().ToString();
        var body = Till.Sale(shop, customer, product);

        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => admin.SendAsync(Request(body, key)).ExpectOkAsync()));

        Assert.Single(results.Select(r => r.Id()).Distinct());
        Assert.Equal(1, await InvoicesForAsync(product));
        Assert.Equal(49, await Till.QtyAsync(Api, shop, product));
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task Retry_StillReturnsTheInvoice_WhenTheStockHasSinceRunOut()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 1);
        var key = Guid.NewGuid().ToString();
        var body = Till.Sale(shop, customer, product);

        var first = await admin.SendAsync(Request(body, key)).ExpectOkAsync();
        var retry = await admin.SendAsync(Request(body, key)).ExpectOkAsync();

        Assert.Equal(first.Id(), retry.Id());
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task SameKey_ForADifferentCart_IsAConflict()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var key = Guid.NewGuid().ToString();
        await admin.SendAsync(Request(Till.Sale(shop, customer, product), key)).ExpectOkAsync();

        var other = await admin.SendAsync(Request(Till.Sale(shop, customer, product, qty: 2), key));

        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
        Assert.Equal(4, await Till.QtyAsync(Api, shop, product));
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task KeyTooLong_Returns400()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api);

        var response = await admin.SendAsync(Request(Till.Sale(shop, customer, product), new string('k', 101)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task SameKey_FromAnotherCashier_IsASeparateSale()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var sara = await Api.AsAsync("sara");
        var key = Guid.NewGuid().ToString();
        var body = Till.Sale(shop, customer, product);

        var mine = await admin.SendAsync(Request(body, key)).ExpectOkAsync();
        var hers = await sara.SendAsync(Request(body, key)).ExpectOkAsync();

        Assert.NotEqual(mine.Id(), hers.Id());
    }

    [Fact]
    [Trait("AC", "SALE-16")]
    public async Task NoKey_TwoIdenticalSalesAreTwoSales()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var body = Till.Sale(shop, customer, product);

        var first = await admin.SendAsync(Request(body, null)).ExpectOkAsync();
        var second = await admin.SendAsync(Request(body, null)).ExpectOkAsync();

        Assert.NotEqual(first.Id(), second.Id());
        Assert.Equal(3, await Till.QtyAsync(Api, shop, product));
    }
}
