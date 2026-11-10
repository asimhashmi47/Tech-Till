using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace TechTill.IntegrationTests;

/// <summary>Any signed-in user could read every customer's phone and address (F12).</summary>
[Collection("api")]
public class LookupExposureTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    [Theory]
    [Trait("AC", "PERM-09")]
    [InlineData("/api/customers/lookup")]
    [InlineData("/api/suppliers/lookup")]
    public async Task Lookup_WithoutARelatedModule_Returns403(string path)
    {
        var zoya = await Api.AsAsync("zoya");

        Assert.Equal(HttpStatusCode.Forbidden, (await zoya.GetAsync(path)).StatusCode);
    }

    [Fact]
    [Trait("AC", "PERM-09")]
    public async Task CustomerLookup_ForTheTill_CarriesNoContactDetails()
    {
        var sara = await Api.AsAsync("sara");

        var rows = await (await sara.GetAsync("/api/customers/lookup")).Content.ReadFromJsonAsync<JsonArray>();

        Assert.NotEmpty(rows!);
        Assert.Contains(rows!, r => r!["isWalkIn"]!.GetValue<bool>());
        Assert.All(rows!, r =>
        {
            Assert.False(r!.AsObject().ContainsKey("phone"));
            Assert.False(r.AsObject().ContainsKey("address"));
        });
    }

    [Fact]
    [Trait("AC", "PERM-09")]
    public async Task SupplierLookup_CarriesNoContactDetails()
    {
        var admin = await Api.AsAsync("admin");

        var rows = await (await admin.GetAsync("/api/suppliers/lookup")).Content.ReadFromJsonAsync<JsonArray>();

        Assert.NotEmpty(rows!);
        Assert.All(rows!, r => Assert.False(r!.AsObject().ContainsKey("phone")));
    }
}
