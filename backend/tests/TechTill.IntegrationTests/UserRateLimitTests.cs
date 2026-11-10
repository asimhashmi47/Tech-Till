using System.Net;
using System.Net.Http.Json;

namespace TechTill.IntegrationTests;

/// <summary>Nothing limited a signed-in user, so heavy exports could be fired at will (F15).</summary>
public class UserRateLimitTests
{
    private static readonly Dictionary<string, string> ProductionLimits = new()
    {
        ["RateLimits:RequestsPerUserPerMinute"] = "600",
        ["RateLimits:ExportsPerUserPerMinute"] = "10",
    };

    [Fact]
    [Trait("AC", "API-08")]
    public async Task Exports_AreLimitedPerUser()
    {
        await using var api = await ApiFactory.StartAsync("Testing", ProductionLimits);
        var zoya = await api.AsAsync("zoya");

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 11; i++)
        {
            statuses.Add((await zoya.PostAsJsonAsync("/api/products/export", new { })).StatusCode);
        }

        Assert.Equal(10, statuses.Count(s => s == HttpStatusCode.OK));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);
        Assert.Equal(HttpStatusCode.OK, (await zoya.PostAsJsonAsync("/api/products/query", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await api.AsAsync("admin")).PostAsJsonAsync("/api/products/export", new { })).StatusCode);
    }

    [Fact]
    [Trait("AC", "API-08")]
    public async Task Requests_AreLimitedPerUser_NotForEveryone()
    {
        await using var api = await ApiFactory.StartAsync("Testing", ProductionLimits);
        var zoya = await api.AsAsync("zoya");

        var statuses = await Task.WhenAll(Enumerable.Range(0, 601).Select(_ => zoya.GetAsync("/api/auth/me")));

        Assert.Equal(600, statuses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, statuses.Count(r => r.StatusCode == HttpStatusCode.TooManyRequests));
        Assert.Equal(HttpStatusCode.OK, (await (await api.AsAsync("sara")).GetAsync("/api/auth/me")).StatusCode);
    }
}
