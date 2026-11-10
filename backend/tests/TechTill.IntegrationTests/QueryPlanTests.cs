using System.Net.Http.Json;
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

    /// <summary>
    /// Loading one invoice joined its lines through every sales line in the database, which
    /// cost about 1.3 s per sale under load.
    /// </summary>
    [Fact]
    [Trait("AC", "PERF-03")]
    public async Task OpeningAnInvoice_NeverScansATable()
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var id = await api.DbAsync(db => db.SalesInvoices.OrderByDescending(i => i.Id).Select(i => i.Id).FirstAsync());
        api.Fault.Seen.Clear();

        await admin.GetAsync($"/api/invoices/{id}").ExpectOkAsync();

        var statements = api.Fault.Seen.Where(s => s.Contains("\"SalesInvoices\"", StringComparison.Ordinal) || s.Contains("\"SalesItems\"", StringComparison.Ordinal)).ToList();
        Assert.NotEmpty(statements);
        foreach (var sql in statements)
        {
            var plan = await api.DbAsync(async db =>
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

            Assert.DoesNotContain("SCAN", plan, StringComparison.Ordinal);
        }
    }

    /// <summary>
    /// Receivables and ageing summed every invoice ever raised, though only unpaid and partly
    /// paid ones can owe anything: about 2 s per dashboard build at 200 users.
    /// </summary>
    [Theory]
    [Trait("AC", "PERF-04")]
    [InlineData("/api/dashboard")]
    [InlineData("/api/ageing/receivable")]
    public async Task OutstandingFigures_ReadOnlyOpenInvoices(string url)
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        api.Fault.Seen.Clear();

        if (url.Contains("ageing", StringComparison.Ordinal))
        {
            await admin.PostAsJsonAsync(url, new { }).ExpectOkAsync();
        }
        else
        {
            await admin.GetAsync(url).ExpectOkAsync();
        }

        var outstanding = api.Fault.Seen
            .Where(s => s.Contains("FROM \"SalesInvoices\"", StringComparison.Ordinal) && s.Contains("\"PaidAmount\"", StringComparison.Ordinal)
                && !s.Contains("\"InvoiceDate\" >= ", StringComparison.Ordinal))
            .Distinct()
            .ToList();
        Assert.NotEmpty(outstanding);

        foreach (var sql in outstanding)
        {
            var alias = System.Text.RegularExpressions.Regex.Match(sql, "FROM \"SalesInvoices\" AS \"(\\w+)\"").Groups[1].Value;
            var plan = await api.DbAsync(async db =>
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

                return steps;
            });

            // A range on the date index still reads the whole history; the status index reads
            // only the invoices that can owe anything.
            Assert.True(
                plan.Exists(step => step.StartsWith($"SEARCH {alias} USING INDEX IX_SalesInvoices_ShopId_Status_InvoiceDate (ShopId=? AND Status=?", StringComparison.Ordinal)),
                $"Plan: {string.Join(" | ", plan)}{Environment.NewLine}SQL: {sql}");
        }
    }

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
