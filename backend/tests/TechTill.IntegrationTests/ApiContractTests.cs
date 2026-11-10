using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TechTill.Api.Security;
using TechTill.Domain.Enums;

namespace TechTill.IntegrationTests;

[Collection("api")]
public class AccessControlTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    private static readonly HashSet<string> Anonymous = new(["api/auth/login", "api/auth/refresh", "health"], StringComparer.OrdinalIgnoreCase);

    [Fact]
    [Trait("AC", "PERM-06")]
    public async Task EveryEndpoint_WithoutAToken_Returns401()
    {
        var endpoints = Api.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToList();
        Assert.True(endpoints.Count > 90, $"Only {endpoints.Count} endpoints found");
        var client = Api.Anonymous();
        var failures = new List<string>();

        foreach (var endpoint in endpoints)
        {
            var template = endpoint.RoutePattern.RawText!.TrimStart('/');
            if (Anonymous.Contains(template))
            {
                continue;
            }

            var path = "/" + System.Text.RegularExpressions.Regex.Replace(template, "\\{[^}]+\\}", "1");
            foreach (var method in endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? [])
            {
                var request = new HttpRequestMessage(new HttpMethod(method), path);
                if (method is "POST" or "PUT")
                {
                    request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                }

                var response = await client.SendAsync(request);
                if (response.StatusCode != HttpStatusCode.Unauthorized)
                {
                    failures.Add($"{method} {path} => {(int)response.StatusCode}");
                }
            }
        }

        Assert.True(failures.Count == 0, string.Join("\n", failures));
    }

    [Fact]
    [Trait("AC", "API-01")]
    [Trait("AC", "API-04")]
    public async Task EveryEndpoint_AsAdmin_WithAnEmptyBody_NeverFails()
    {
        // A private copy, because this sweep calls the delete and update endpoints too.
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var failures = new List<string>();

        foreach (var endpoint in api.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>())
        {
            var template = endpoint.RoutePattern.RawText!.TrimStart('/');
            if (template.Contains("auth/logout", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var path = "/" + System.Text.RegularExpressions.Regex.Replace(template, "\\{[^}]+\\}", "2");
            foreach (var method in endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? [])
            {
                var request = new HttpRequestMessage(new HttpMethod(method), path);
                if (method is "POST" or "PUT")
                {
                    request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                }

                var response = await admin.SendAsync(request);
                if ((int)response.StatusCode >= 500)
                {
                    failures.Add($"{method} {path} => {(int)response.StatusCode}");
                }
            }
        }

        Assert.True(failures.Count == 0, string.Join("\n", failures));
    }

    private static readonly HashSet<string> OpenToAnySignedInUser =
    [
        "Auth.Login", "Auth.Refresh", "Auth.Logout", "Auth.ChangePassword", "Auth.Me",
        "Categories.Lookup", "Shops.Lookup",
        "Expenses.Categories", "Settings.Get",
    ];

    [Fact]
    [Trait("AC", "PERM-07")]
    public void EveryAction_DeclaresAPermission_OrIsOnTheReviewedList()
    {
        var undeclared = typeof(RequirePermissionAttribute).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).Select(m => (Type: t, Method: m)))
            .Where(x => x.Method.GetCustomAttributes().Any(a => a is Microsoft.AspNetCore.Mvc.Routing.HttpMethodAttribute))
            .Where(x => x.Type.GetCustomAttribute<AdminOnlyAttribute>() is null
                && x.Method.GetCustomAttribute<AdminOnlyAttribute>() is null
                && x.Method.GetCustomAttribute<RequirePermissionAttribute>() is null
                && x.Method.GetCustomAttribute<RequireAnyPermissionAttribute>() is null)
            .Select(x => $"{x.Type.Name.Replace("Controller", "", StringComparison.Ordinal)}.{x.Method.Name}")
            .Where(name => !OpenToAnySignedInUser.Contains(name))
            .ToList();

        Assert.True(undeclared.Count == 0, string.Join(", ", undeclared));
    }

    [Theory]
    [Trait("AC", "PERM-07")]
    [Trait("AC", "AUD-02")]
    [InlineData("zoya", "POST", "/api/customers/query")]
    [InlineData("zoya", "POST", "/api/suppliers/query")]
    [InlineData("zoya", "POST", "/api/expenses/query")]
    [InlineData("zoya", "POST", "/api/petty-cash/query")]
    [InlineData("zoya", "POST", "/api/purchases/query")]
    [InlineData("zoya", "POST", "/api/shops/query")]
    [InlineData("zoya", "POST", "/api/users/query")]
    [InlineData("zoya", "POST", "/api/audit-log/query")]
    [InlineData("zoya", "POST", "/api/audit-log/export")]
    [InlineData("zoya", "POST", "/api/ageing/receivable")]
    [InlineData("zoya", "POST", "/api/ageing/payable")]
    [InlineData("sara", "POST", "/api/users")]
    [InlineData("sara", "POST", "/api/invoices/1/void")]
    [InlineData("sara", "POST", "/api/products")]
    [InlineData("sara", "POST", "/api/stock/adjust")]
    [InlineData("sara", "GET", "/api/reports/profit-and-loss")]
    [InlineData("omar", "POST", "/api/pos/sale")]
    [InlineData("hina", "PUT", "/api/settings")]
    public async Task LowPrivilegeToken_OnForbiddenModule_Returns403(string user, string method, string path)
    {
        var client = await Api.AsAsync(user);
        var request = new HttpRequestMessage(new HttpMethod(method), path)
        {
            Content = new StringContent(method == "PUT" ? "{\"currencyCode\":\"USD\"}" : "{}", Encoding.UTF8, "application/json"),
        };

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task<long> MallIdAsync() => await Api.DbAsync(db => db.Shops.Where(s => s.Code == "MALL").Select(s => s.Id).FirstAsync());

    [Fact]
    [Trait("AC", "PERM-04")]
    public async Task ReadOnlyUser_AskingForAnotherShop_Gets403()
    {
        var mall = await MallIdAsync();
        var client = await Api.AsAsync("zoya");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/invoices/query", new { shopId = mall })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/reports/balance-sheet?shopId={mall}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/dashboard?shopId={mall}")).StatusCode);
    }

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task ReadOnlyUser_ReadingAnotherShopsInvoice_Gets404_AndWriteGets403()
    {
        var mall = await MallIdAsync();
        var invoice = await Api.DbAsync(db => db.SalesInvoices.Where(i => i.ShopId == mall).Select(i => i.Id).FirstAsync());
        var sara = await Api.AsAsync("sara");

        Assert.Equal(HttpStatusCode.NotFound, (await (await Api.AsAsync("zoya")).GetAsync($"/api/invoices/{invoice}")).StatusCode);
        var sale = new { shopId = mall, customerId = 1, discount = 0, paidNow = 0, paymentMethod = "Cash", items = new[] { new { productId = 1, qty = 1, unitPrice = 1 } } };
        Assert.Equal(HttpStatusCode.Forbidden, (await sara.PostAsJsonAsync("/api/pos/sale", sale)).StatusCode);
    }

    [Fact]
    [Trait("AC", "PERM-08")]
    public async Task StaffQuery_NeverReturnsAnotherShopsRows()
    {
        var main = await Api.DbAsync(db => db.Shops.Where(s => s.Code == "MAIN").Select(s => s.Name).FirstAsync());
        var body = await (await Api.AsAsync("zoya")).PostAsJsonAsync("/api/invoices/query", new { pageSize = 500 }).ExpectOkAsync();

        Assert.All(body["items"]!.AsArray(), row => Assert.Equal(main, row!["shopName"]!.GetValue<string>()));
    }
}

[Collection("api")]
public class BusinessFlowTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    private async Task<(long Shop, long Customer, long Product, HttpClient Admin)> ArrangeAsync(int stock = 10, decimal price = 100m)
    {
        var admin = await Api.AsAsync("admin");
        var shop = await Api.DbAsync(db => db.Shops.Where(s => s.Code == "MAIN").Select(s => s.Id).FirstAsync());
        var tag = Guid.NewGuid().ToString("N")[..10];
        var customer = (await admin.PostAsJsonAsync("/api/customers", new { name = "Cust " + tag, isActive = true }).ExpectOkAsync()).Id();
        var category = await Api.DbAsync(db => db.Categories.Select(c => c.Id).FirstAsync());
        var product = (await admin.PostAsJsonAsync("/api/products", new { sku = "T-" + tag, name = "Prod " + tag, categoryId = category, costPrice = 60m, salePrice = price, reorderLevel = 0, isActive = true }).ExpectOkAsync()).Id();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/stock/opening", new { shopId = shop, productId = product, qty = stock })).StatusCode);
        return (shop, customer, product, admin);
    }

    private static object Sale(long shop, long customer, long product, int qty = 2, decimal price = 100m, decimal paid = 200m, string method = "Cash")
        => new { shopId = shop, customerId = customer, discount = 0m, paidNow = paid, paymentMethod = method, items = new[] { new { productId = product, qty, unitPrice = price } } };

    [Fact]
    [Trait("AC", "SALE-01")]
    [Trait("AC", "API-04")]
    public async Task Sale_OverHttp_ReturnsContractAndUpdatesEveryTable()
    {
        var (shop, customer, product, admin) = await ArrangeAsync();

        var invoice = await admin.PostAsJsonAsync("/api/pos/sale", Sale(shop, customer, product)).ExpectOkAsync();

        Assert.Equal("Paid", invoice["status"]!.GetValue<string>());
        Assert.Equal("Cash", invoice["paymentMethod"]!.GetValue<string>());
        Assert.False(invoice.ContainsKey("voidReason"));
        var id = invoice.Id();

        Assert.Equal(8, await Api.DbAsync(db => db.StockLevels.Where(s => s.ShopId == shop && s.ProductId == product).Select(s => s.Qty).FirstAsync()));
        Assert.Equal(1, await Api.DbAsync(db => db.CustomerPayments.CountAsync(p => p.SalesInvoiceId == id)));
        var no = invoice["invoiceNo"]!.GetValue<string>();
        Assert.Equal(1, await Api.DbAsync(db => db.PettyCashEntries.CountAsync(p => p.Note == "Cash sale " + no)));
        Assert.True(await Api.DbAsync(db => db.AuditLogs.AnyAsync(a => a.Entity == "SalesInvoice" && a.EntityId == id && a.Action == AuditAction.Create)));
    }

    [Fact]
    [Trait("AC", "SALE-14")]
    public async Task Sale_FailingPartWay_RollsEverythingBack()
    {
        var (shop, customer, product, admin) = await ArrangeAsync();
        var invoicesBefore = await Api.DbAsync(db => db.SalesInvoices.CountAsync());
        var movementsBefore = await Api.DbAsync(db => db.StockMovements.CountAsync());

        Api.Fault.FailWhenSqlContains = "INSERT INTO \"PettyCashEntries\"";
        HttpResponseMessage response;

        try
        {
            response = await admin.PostAsJsonAsync("/api/pos/sale", Sale(shop, customer, product));
        }
        finally
        {
            Api.Fault.FailWhenSqlContains = null;
        }

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(invoicesBefore, await Api.DbAsync(db => db.SalesInvoices.CountAsync()));
        Assert.Equal(movementsBefore, await Api.DbAsync(db => db.StockMovements.CountAsync()));
        Assert.Equal(10, await Api.DbAsync(db => db.StockLevels.Where(s => s.ShopId == shop && s.ProductId == product).Select(s => s.Qty).FirstAsync()));
    }

    [Fact]
    [Trait("AC", "SALE-08")]
    [Trait("AC", "API-06")]
    public async Task Void_OverHttp_RestoresStock_AndRepeatIsAConflict()
    {
        var (shop, customer, product, admin) = await ArrangeAsync();
        var invoice = await admin.PostAsJsonAsync("/api/pos/sale", Sale(shop, customer, product)).ExpectOkAsync();

        var voided = await admin.PostAsJsonAsync($"/api/invoices/{invoice.Id()}/void", new { reason = "Mistake" }).ExpectOkAsync();
        var again = await admin.PostAsJsonAsync($"/api/invoices/{invoice.Id()}/void", new { reason = "Mistake" });

        Assert.Equal("Void", voided["status"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(10, await Api.DbAsync(db => db.StockLevels.Where(s => s.ShopId == shop && s.ProductId == product).Select(s => s.Qty).FirstAsync()));
    }

    [Theory]
    [Trait("AC", "SALE-04")]
    [InlineData(0, 100, 0)]
    [InlineData(-1, 100, 0)]
    [InlineData(1, -1, 0)]
    [InlineData(1, 100, -1)]
    [InlineData(1, 100, 101)]
    public async Task Sale_InvalidNumbers_Return400WithFieldErrors(int qty, int price, int paid)
    {
        var (shop, customer, product, admin) = await ArrangeAsync();

        var response = await admin.PostAsJsonAsync("/api/pos/sale", Sale(shop, customer, product, qty, price, paid));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull((await response.JsonAsync())["errors"]);
    }

    [Fact]
    [Trait("AC", "API-01")]
    public async Task Errors_AreProblemDetails_WithCorrelationId()
    {
        var admin = await Api.AsAsync("admin");

        var notFound = await admin.GetAsync("/api/invoices/999999");
        var invalid = await admin.PostAsync("/api/customers", new StringContent("{ not json", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        var body = await notFound.JsonAsync();
        Assert.Equal(404, body["status"]!.GetValue<int>());
        Assert.NotNull(body["correlationId"]);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.NotNull((await invalid.JsonAsync())["correlationId"]);
    }

    [Fact]
    [Trait("AC", "API-01")]
    public async Task ServerError_InProduction_HasNoStackTrace()
    {
        await using var api = await ApiFactory.StartAsync("Production");
        var admin = await api.AsAsync("admin");

        api.Fault.FailWhenSqlContains = "FROM \"Customers\"";
        var response = await admin.GetAsync("/api/customers/lookup");
        api.Fault.FailWhenSqlContains = null;

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Injected", text, StringComparison.Ordinal);
        Assert.DoesNotContain("   at ", text, StringComparison.Ordinal);
        Assert.Contains("correlationId", text, StringComparison.Ordinal);
    }

    [Theory]
    [Trait("AC", "API-02")]
    [InlineData("/health")]
    [InlineData("/api/auth/me")]
    public async Task SecurityHeaders_ArePresent(string path)
    {
        var response = await Api.Anonymous().GetAsync(path);

        Assert.Contains("default-src 'self'", string.Join("", response.Headers.GetValues("Content-Security-Policy")), StringComparison.Ordinal);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.True(response.Headers.Contains("Referrer-Policy"));
        Assert.True(response.Headers.Contains("Permissions-Policy"));
    }

    [Fact]
    [Trait("AC", "API-03")]
    public async Task Migrations_AreApplied_AndTheSeedFillsTheReports()
    {
        Assert.Empty(await Api.DbAsync(async db => (await db.Database.GetPendingMigrationsAsync()).ToList()));

        var admin = await Api.AsAsync("admin");
        var dashboard = await admin.GetAsync("/api/dashboard?from=2020-01-01").ContinueWith(t => t.Result.JsonAsync()).Unwrap();

        Assert.True(dashboard["kpi"]!["periodSales"].Dec() > 0);
        Assert.Equal(6, await Api.DbAsync(db => db.Users.CountAsync()));
    }

    [Fact]
    [Trait("AC", "API-04")]
    public async Task Query_ReturnsPagingContract_AndSortsAndFilters()
    {
        var admin = await Api.AsAsync("admin");

        var body = await admin.PostAsJsonAsync("/api/products/query", new
        {
            page = 1,
            pageSize = 3,
            sort = new[] { new { field = "salePrice", desc = true } },
            filters = new[] { new { field = "salePrice", @operator = "GreaterThan", value = "1000" } },
        }).ExpectOkAsync();

        Assert.Equal(1, body["page"]!.GetValue<int>());
        Assert.Equal(3, body["pageSize"]!.GetValue<int>());
        Assert.True(body["totalCount"]!.GetValue<int>() >= 3);
        Assert.True(body["totalPages"]!.GetValue<int>() >= 1);
        var prices = body["items"]!.AsArray().Select(i => i!["salePrice"].Dec()).ToList();
        Assert.Equal(prices.OrderByDescending(p => p), prices);
    }

    [Theory]
    [Trait("AC", "API-05")]
    [Trait("AC", "AUD-01")]
    [InlineData("/api/products/export", "products")]
    [InlineData("/api/invoices/export", "invoices")]
    [InlineData("/api/audit-log/export", "audit-log")]
    [InlineData("/api/users/export", "users")]
    [InlineData("/api/ageing/receivable/export", "receivable-ageing")]
    public async Task Exports_ReturnASpreadsheetWithAFilename(string path, string name)
    {
        var admin = await Api.AsAsync("admin");

        var response = await admin.PostAsJsonAsync(path, new { page = 1, pageSize = 100 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType!.MediaType);
        Assert.StartsWith(name, response.Content.Headers.ContentDisposition!.FileName!.Trim('"'), StringComparison.Ordinal);
        Assert.Equal((byte)'P', (await response.Content.ReadAsByteArrayAsync())[0]);
    }

    [Fact]
    [Trait("AC", "API-06")]
    public async Task DeletingTwice_IsSafe()
    {
        var admin = await Api.AsAsync("admin");
        var (shop, _, _, _) = await ArrangeAsync();
        var category = await Api.DbAsync(db => db.ExpenseCategories.Select(c => c.Id).FirstAsync());
        var expense = await admin.PostAsJsonAsync("/api/expenses", new { shopId = shop, expenseCategoryId = category, expenseDate = DateTime.UtcNow, amount = 5m, method = "Card" }).ExpectOkAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/expenses/{expense.Id()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/expenses/{expense.Id()}")).StatusCode);
    }

    [Fact]
    [Trait("AC", "RPT-02")]
    [Trait("AC", "RPT-03")]
    public async Task SeededBooks_Balance_AndAgeingAgrees()
    {
        var admin = await Api.AsAsync("admin");

        var sheet = await admin.GetFromJsonAsync<JsonObject>("/api/reports/balance-sheet");
        var receivable = await admin.PostAsJsonAsync("/api/ageing/receivable", new { pageSize = 1 }).ExpectOkAsync();
        var payable = await admin.PostAsJsonAsync("/api/ageing/payable", new { pageSize = 1 }).ExpectOkAsync();

        Assert.Equal(sheet!["totalAssets"].Dec(), sheet["totalLiabilities"].Dec() + sheet["ownerEquity"].Dec(), 2);
        Assert.Equal(sheet["receivables"].Dec(), receivable["summary"]!["total"].Dec(), 0);
        Assert.Equal(sheet["payables"].Dec(), payable["summary"]!["total"].Dec(), 0);
    }

    [Fact]
    [Trait("AC", "LED-02")]
    public async Task LedgerClosing_MatchesPartyBalance_OverHttp()
    {
        var admin = await Api.AsAsync("admin");
        var customers = await admin.PostAsJsonAsync("/api/customers/query", new { pageSize = 50, sort = new[] { new { field = "receivable", desc = true } } }).ExpectOkAsync();
        var top = customers["items"]!.AsArray()[0]!.AsObject();

        var ledger = await admin.GetFromJsonAsync<JsonObject>($"/api/customers/{top.Id()}/ledger");

        Assert.Equal(top["receivable"].Dec(), ledger!["closing"].Dec(), 2);
    }
}
