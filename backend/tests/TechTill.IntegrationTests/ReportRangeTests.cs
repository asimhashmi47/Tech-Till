using System.Net;

namespace TechTill.IntegrationTests;

/// <summary>A 1,100 year report built 72 MB, and a far future date threw a 500 (F14).</summary>
[Collection("api")]
public class ReportRangeTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    [Theory]
    [Trait("AC", "RPT-06")]
    [InlineData("/api/reports/daily?from=1000-01-01&to=2100-01-01")]
    [InlineData("/api/reports/monthly?from=2000-01-01&to=2099-12-31")]
    [InlineData("/api/reports/daily?to=9999-12-31")]
    [InlineData("/api/reports/balance-sheet?to=9999-12-31")]
    [InlineData("/api/reports/cash-flow?from=0001-01-01")]
    [InlineData("/api/dashboard?to=9999-12-31")]
    [InlineData("/api/dashboard?from=1900-01-01")]
    [InlineData("/api/customers/1/ledger?to=9999-12-31")]
    public async Task OutOfBoundsRange_Returns400(string url)
    {
        var admin = await Api.AsAsync("admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync(url)).StatusCode);
    }

    [Theory]
    [Trait("AC", "RPT-06")]
    [InlineData("/api/reports/monthly?from=2020-01-01&to=2029-12-31")]
    [InlineData("/api/reports/daily")]
    [InlineData("/api/dashboard?from=2026-01-01&to=2026-06-30")]
    public async Task RangeWithinBounds_Runs(string url)
    {
        var admin = await Api.AsAsync("admin");

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(url)).StatusCode);
    }
}
