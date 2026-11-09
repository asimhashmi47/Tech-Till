using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TechTill.Domain.Enums;

namespace TechTill.IntegrationTests;

/// <summary>The void status was read outside the transaction, so stock came back many times (F04).</summary>
[Collection("api")]
public class VoidRaceTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    [Fact]
    [Trait("AC", "SALE-15")]
    public async Task ParallelVoids_RestoreStockAndCashExactlyOnce()
    {
        var (shop, customer, product, admin) = await Till.ArrangeAsync(Api, stock: 5);
        var invoice = await admin.PostAsJsonAsync("/api/pos/sale", Till.Sale(shop, customer, product, qty: 2)).ExpectOkAsync();
        var number = invoice["invoiceNo"]!.GetValue<string>();

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => admin.PostAsJsonAsync($"/api/invoices/{invoice.Id()}/void", new { reason = "race" })));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(19, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(5, await Till.QtyAsync(Api, shop, product));
        Assert.Equal(1, await Api.DbAsync(db => db.StockMovements.CountAsync(m => m.Reference == number && m.Type == StockMovementType.SaleVoid)));
        Assert.Equal(1, await Api.DbAsync(db => db.PettyCashEntries.CountAsync(e => e.Note == $"Reversal of void invoice {number}")));
    }
}
