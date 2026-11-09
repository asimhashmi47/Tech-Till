using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;

namespace TechTill.IntegrationTests;

/// <summary>A fresh install must never come up with the password published in the README (F02).</summary>
public class ProductionStartupTests
{
    private const string OwnerPassword = "a-long-owner-chosen-passphrase";

    private static Task<HttpResponseMessage> LoginAsync(ApiFactory api, string password)
        => api.Anonymous().PostAsJsonAsync("/api/auth/login", new { username = "admin", password });

    [Fact]
    [Trait("AC", "BOOT-01")]
    public async Task Production_EmptyDatabase_WithoutAnOwnerPassword_RefusesToStart()
    {
        var error = await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await using var api = await ApiFactory.StartEmptyAsync("Production");
        });

        Assert.Contains("Bootstrap:AdminPassword", error.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [Trait("AC", "BOOT-01")]
    [InlineData("short")]
    [InlineData("TechTill#2026")]
    public async Task Production_EmptyDatabase_WithAWeakOrPublishedPassword_RefusesToStart(string password)
    {
        var error = await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await using var api = await ApiFactory.StartEmptyAsync("Production", new() { ["Bootstrap:AdminPassword"] = password });
        });

        Assert.Contains("Bootstrap:AdminPassword", error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    [Trait("AC", "BOOT-02")]
    public async Task Production_EmptyDatabase_CreatesOnlyTheOwner_WithTheChosenPassword()
    {
        await using var api = await ApiFactory.StartEmptyAsync("Production", new() { ["Bootstrap:AdminPassword"] = OwnerPassword });

        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(api, OwnerPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await LoginAsync(api, ApiFactory.Password)).StatusCode);

        Assert.Equal(1, await api.DbAsync(db => db.Users.CountAsync()));
        Assert.Equal(0, await api.DbAsync(db => db.Shops.CountAsync()));
        Assert.Equal(0, await api.DbAsync(db => db.Products.CountAsync()));
        Assert.Equal(0, await api.DbAsync(db => db.SalesInvoices.CountAsync()));
        Assert.Equal(1, await api.DbAsync(db => db.Customers.CountAsync(c => c.IsWalkIn)));
    }

    [Fact]
    [Trait("AC", "BOOT-02")]
    public async Task Production_ExistingDatabase_NeedsNoOwnerPassword_AndIsLeftAlone()
    {
        await using var api = await ApiFactory.StartAsync("Production");

        Assert.Equal(6, await api.DbAsync(db => db.Users.CountAsync()));
    }
}
