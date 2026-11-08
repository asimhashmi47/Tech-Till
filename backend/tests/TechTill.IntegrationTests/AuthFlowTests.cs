using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.IdentityModel.Tokens;
using Microsoft.EntityFrameworkCore;
using TechTill.Domain.Enums;

namespace TechTill.IntegrationTests;

/// <summary>Each test gets its own API, because sign-in is rate limited per process.</summary>
public class AuthFlowTests
{
    private static Task<HttpResponseMessage> LoginAsync(ApiFactory api, string username = "sara", string password = ApiFactory.Password)
        => api.Anonymous().PostAsJsonAsync("/api/auth/login", new { username, password });

    [Fact]
    [Trait("AC", "AUTH-01")]
    public async Task Login_Valid_ReturnsContractAndAudits()
    {
        await using var api = await ApiFactory.StartAsync();

        var body = await (await LoginAsync(api)).JsonAsync();

        Assert.NotNull(body["accessToken"]);
        Assert.NotNull(body["refreshToken"]);
        Assert.Equal("sara", body["user"]!["username"]!.GetValue<string>());
        Assert.Equal("Standard", body["user"]!["role"]!.GetValue<string>());
        Assert.DoesNotContain("passwordHash", body.ToJsonString(), StringComparison.OrdinalIgnoreCase);
        Assert.True(await api.DbAsync(db => db.AuditLogs.AnyAsync(a => a.Action == AuditAction.Login && a.Username == "sara")));
    }

    [Theory]
    [Trait("AC", "AUTH-02")]
    [InlineData("sara", "wrong-password")]
    [InlineData("no-such-user", "TechTill#2026")]
    public async Task Login_BadCredentials_Return403ProblemWithoutTelling(string username, string password)
    {
        await using var api = await ApiFactory.StartAsync();

        var response = await LoginAsync(api, username, password);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Invalid username or password.", (await response.JsonAsync())["detail"]!.GetValue<string>());
    }

    [Fact]
    [Trait("AC", "AUTH-02")]
    public async Task Login_MissingFields_Return400()
    {
        await using var api = await ApiFactory.StartAsync();
        var response = await api.Anonymous().PostAsJsonAsync("/api/auth/login", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-03")]
    [Trait("AC", "AUTH-04")]
    public async Task Refresh_RotatesAndRefusesReuse()
    {
        await using var api = await ApiFactory.StartAsync();
        var first = await (await LoginAsync(api)).JsonAsync();
        var token = first["refreshToken"]!.GetValue<string>();

        var second = await api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = token });
        var replay = await api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = token });

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.NotEqual(token, (await second.JsonAsync())["refreshToken"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Forbidden, replay.StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-05")]
    [Trait("AC", "API-06")]
    public async Task Logout_RevokesRefreshToken_AndIsSafeToRepeat()
    {
        await using var api = await ApiFactory.StartAsync();
        var login = await (await LoginAsync(api)).JsonAsync();
        var token = login["refreshToken"]!.GetValue<string>();
        var client = api.WithToken(login["accessToken"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/logout", new { refreshToken = token })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/logout", new { refreshToken = token })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = token })).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public async Task ChangePassword_RevokesSessions_AndNewPasswordWorks()
    {
        await using var api = await ApiFactory.StartAsync();
        var login = await (await LoginAsync(api)).JsonAsync();
        var client = api.WithToken(login["accessToken"]!.GetValue<string>());

        var wrong = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "nope", newPassword = "brand-new-pass" });
        var changed = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFactory.Password, newPassword = "brand-new-pass" });
        var refresh = await api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = login["refreshToken"]!.GetValue<string>() });

        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, changed.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, refresh.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(api, "sara", "brand-new-pass")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await LoginAsync(api)).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-07")]
    public async Task Me_ReturnsTheCallersShopsOnly()
    {
        await using var api = await ApiFactory.StartAsync();
        var me = await (await api.AsAsync("zoya")).GetFromJsonAsync<JsonObject>("/api/auth/me");
        Assert.Single(me!["shops"]!.AsArray());
    }

    private static string Mint(string secret, string issuer = "TechTill", DateTime? expires = null, string role = "Admin")
    {
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var exp = expires ?? now.AddMinutes(5);
        var token = new JwtSecurityToken(
            issuer,
            "TechTill",
            [new Claim(ClaimTypes.NameIdentifier, "1"), new Claim(ClaimTypes.Name, "admin"), new Claim(ClaimTypes.Role, role)],
            exp < now ? exp.AddMinutes(-5) : now,
            exp,
            credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string AlgNone()
    {
        static string B64(string s) => Base64UrlEncoder.Encode(s);
        var exp = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
        return $"{B64("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{B64($"{{\"http://schemas.microsoft.com/ws/2008/06/identity/claims/role\":\"Admin\",\"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier\":\"1\",\"iss\":\"TechTill\",\"aud\":\"TechTill\",\"exp\":{exp}}}")}.";
    }

    [Fact]
    [Trait("AC", "AUTH-08")]
    public async Task ForgedTokens_AreRefused_AndAValidOneIsAccepted()
    {
        await using var api = await ApiFactory.StartAsync();
        var valid = Mint(ApiFactory.Secret);
        var parts = valid.Split('.');

        var forged = new Dictionary<string, string>
        {
            ["wrong key"] = Mint(new string('x', 46)),
            ["wrong issuer"] = Mint(ApiFactory.Secret, issuer: "Evil"),
            ["expired"] = Mint(ApiFactory.Secret, expires: DateTime.UtcNow.AddMinutes(-5)),
            ["alg none"] = AlgNone(),
            ["tampered payload"] = $"{parts[0]}.{Base64UrlEncoder.Encode("{\"role\":\"Admin\"}")}.{parts[2]}",
            ["garbage"] = "not.a.token",
        };

        foreach (var (name, token) in forged)
        {
            var response = await api.WithToken(token).GetAsync("/api/auth/me");
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{name} returned {(int)response.StatusCode}");
        }

        Assert.Equal(HttpStatusCode.OK, (await api.WithToken(valid).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-09")]
    public async Task Login_MoreThanTheWindowAllows_Returns429()
    {
        await using var api = await ApiFactory.StartAsync();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 11; i++)
        {
            statuses.Add((await LoginAsync(api, "sara", "wrong")).StatusCode);
        }

        Assert.Equal(10, statuses.Count(s => s == HttpStatusCode.Forbidden));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);
    }
}
