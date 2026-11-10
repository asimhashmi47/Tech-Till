using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace TechTill.IntegrationTests;

/// <summary>SQLite ignores declared lengths, so a 5 MB customer name was stored (F13).</summary>
[Collection("api")]
public class InputSizeTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    [Fact]
    [Trait("AC", "API-07")]
    public async Task TextLongerThanItsColumn_Returns400_KeyedToTheField()
    {
        var admin = await Api.AsAsync("admin");

        var response = await admin.PostAsJsonAsync("/api/customers", new { name = new string('a', 141), isActive = true });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.True(body!["errors"]!.AsObject().ContainsKey("Name"));
    }

    [Fact]
    [Trait("AC", "API-07")]
    public async Task TextAtItsColumnLength_IsStored()
    {
        var admin = await Api.AsAsync("admin");

        var created = await admin.PostAsJsonAsync("/api/customers", new { name = new string('a', 140), isActive = true }).ExpectOkAsync();

        Assert.Equal(140, created["name"]!.GetValue<string>().Length);
    }

    [Fact]
    [Trait("AC", "API-07")]
    public async Task ABodyOverOneMegabyte_IsRefused()
    {
        var admin = await Api.AsAsync("admin");

        var response = await admin.PostAsJsonAsync("/api/customers", new { name = new string('a', 2_000_000), isActive = true });

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    [Trait("AC", "API-07")]
    public async Task AnOverlongUsername_AtSignIn_IsStillAPlainRefusal()
    {
        var response = await Api.Anonymous().PostAsJsonAsync("/api/auth/login", new { username = new string('u', 500), password = "x" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
