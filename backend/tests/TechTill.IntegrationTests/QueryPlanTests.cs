using Microsoft.EntityFrameworkCore;

namespace TechTill.IntegrationTests;

/// <summary>
/// The invoice grid counted and sorted every invoice in the shop on each page, 240 ms each on
/// a year of data with nothing else running, which queued everything behind it under load.
/// </summary>
[Collection("api")]
public class QueryPlanTests(SharedApi shared)
{
    private Task<string> PlanAsync(string sql)
        => shared.Api.DbAsync(async db =>
        {
            var connection = db.Database.GetDbConnection();
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "EXPLAIN QUERY PLAN " + sql;
            await using var reader = await command.ExecuteReaderAsync();
            var steps = new List<string>();
            while (await reader.ReadAsync())
            {
                steps.Add(reader.GetString(3));
            }

            return string.Join(" | ", steps);
        });

    [Fact]
    [Trait("AC", "PERF-02")]
    public async Task CountingAShopsInvoices_ReadsOnlyAnIndex()
    {
        var plan = await PlanAsync("""SELECT COUNT(*) FROM "SalesInvoices" AS "s" WHERE NOT ("s"."IsDeleted") AND "s"."ShopId" = 1""");

        Assert.Contains("COVERING INDEX", plan, StringComparison.Ordinal);
    }

    [Fact]
    [Trait("AC", "PERF-02")]
    public async Task TheNewestPage_IsReadInIndexOrder_WithoutSortingTheShop()
    {
        var plan = await PlanAsync("""SELECT "s"."Id" FROM "SalesInvoices" AS "s" WHERE NOT ("s"."IsDeleted") AND "s"."ShopId" = 1 ORDER BY "s"."InvoiceDate" DESC LIMIT 25""");

        Assert.DoesNotContain("TEMP B-TREE", plan, StringComparison.Ordinal);
    }
}
