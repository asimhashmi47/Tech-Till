using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace TechTill.IntegrationTests;

/// <summary>Removed staff used to keep working until their 30 minute token ran out (F07).</summary>
public class SessionRevocationTests
{
    private static async Task<JsonObject> SignInAsync(ApiFactory api, string username, string password = ApiFactory.Password)
        => await api.Anonymous().PostAsJsonAsync("/api/auth/login", new { username, password }).ExpectOkAsync();

    private static string Access(JsonObject session) => session["accessToken"]!.GetValue<string>();

    private static async Task<long> UserIdAsync(HttpClient admin, string username)
        => (await admin.PostAsJsonAsync("/api/users/query", new { search = username }).ExpectOkAsync())["items"]!.AsArray()
            .First(u => u!["username"]!.GetValue<string>() == username)!["id"]!.GetValue<long>();

    private static object Owner(string username, string role, bool active = true)
        => new { username, fullName = "Mallory Test", role, isActive = active, password = (string?)null, shopIds = Array.Empty<long>(), permissions = Array.Empty<object>() };

    private static async Task<(long Id, string Token)> NewOwnerAsync(ApiFactory api, HttpClient admin)
    {
        var body = new { username = "mallory", fullName = "Mallory Test", role = "Admin", isActive = true, password = "mallory-pass-1", shopIds = Array.Empty<long>(), permissions = Array.Empty<object>() };
        var id = (await admin.PostAsJsonAsync("/api/users", body).ExpectOkAsync()).Id();
        return (id, Access(await SignInAsync(api, "mallory", "mallory-pass-1")));
    }

    [Fact]
    [Trait("AC", "AUTH-11")]
    public async Task Deactivating_EndsTheAccessTokenAtOnce()
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var token = Access(await SignInAsync(api, "bilal"));
        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(token).GetAsync("/api/auth/me")).StatusCode);

        await admin.DeleteAsync($"/api/users/{await UserIdAsync(admin, "bilal")}");

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.WithToken(token).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-11")]
    public async Task SettingInactiveThroughEdit_EndsTheAccessTokenAtOnce()
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var (id, token) = await NewOwnerAsync(api, admin);

        await admin.PutAsJsonAsync($"/api/users/{id}", Owner("mallory", "Standard", active: false)).ExpectOkAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.WithToken(token).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-11")]
    public async Task Demoting_EndsTheOldAdminToken_AtOnce()
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var (id, token) = await NewOwnerAsync(api, admin);
        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(token).PostAsJsonAsync("/api/users/query", new { })).StatusCode);

        await admin.PutAsJsonAsync($"/api/users/{id}", Owner("mallory", "Standard")).ExpectOkAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.WithToken(token).PostAsJsonAsync("/api/users/query", new { })).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-11")]
    public async Task EditingNameOnly_KeepsTheSessionAlive()
    {
        await using var api = await ApiFactory.StartAsync();
        var admin = await api.AsAsync("admin");
        var (id, token) = await NewOwnerAsync(api, admin);

        await admin.PutAsJsonAsync($"/api/users/{id}", Owner("mallory", "Admin")).ExpectOkAsync();

        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(token).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-12")]
    public async Task Logout_EndsThatAccessToken_ButNotAnotherDevice()
    {
        await using var api = await ApiFactory.StartAsync();
        var till = await SignInAsync(api, "sara");
        var phone = await SignInAsync(api, "sara");
        var client = api.WithToken(Access(till));

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/logout", new { refreshToken = till["refreshToken"]!.GetValue<string>() })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(Access(phone)).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-12")]
    public async Task ChangingPassword_EndsEveryAccessToken()
    {
        await using var api = await ApiFactory.StartAsync();
        var token = Access(await SignInAsync(api, "sara"));
        var client = api.WithToken(token);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFactory.Password, newPassword = "a-brand-new-pass" })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(Access(await SignInAsync(api, "sara", "a-brand-new-pass"))).GetAsync("/api/auth/me")).StatusCode);
    }
}
