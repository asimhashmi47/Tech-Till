using System.Net;
using System.Net.Http.Json;

namespace TechTill.IntegrationTests;

/// <summary>One shared bucket used to let anyone lock every user out of sign-in (F09).</summary>
public class SignInLimiterTests
{
    private static Task<HttpResponseMessage> LoginAsync(ApiFactory api, string username, string password = ApiFactory.Password)
        => api.Anonymous().PostAsJsonAsync("/api/auth/login", new { username, password });

    [Fact]
    [Trait("AC", "AUTH-13")]
    public async Task JunkAttempts_DoNotBlockARealUser()
    {
        await using var api = await ApiFactory.StartAsync();

        for (var i = 0; i < 12; i++)
        {
            await LoginAsync(api, "nobody", "x");
        }

        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(api, "admin")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-13")]
    public async Task TooManyFailures_LockThatAccount_ButNotAnother()
    {
        await using var api = await ApiFactory.StartAsync();

        for (var i = 0; i < 10; i++)
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await LoginAsync(api, "sara", "wrong")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await LoginAsync(api, "sara")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await LoginAsync(api, "SARA")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(api, "hina")).StatusCode);
    }

    [Fact]
    [Trait("AC", "AUTH-13")]
    public async Task ASuccessfulSignIn_ClearsTheFailures()
    {
        await using var api = await ApiFactory.StartAsync();

        for (var round = 0; round < 2; round++)
        {
            for (var i = 0; i < 9; i++)
            {
                Assert.Equal(HttpStatusCode.Forbidden, (await LoginAsync(api, "sara", "wrong")).StatusCode);
            }

            Assert.Equal(HttpStatusCode.OK, (await LoginAsync(api, "sara")).StatusCode);
        }
    }

    [Fact]
    [Trait("AC", "AUTH-13")]
    public async Task AttemptsAgainstManyAccounts_AreCappedPerAddress()
    {
        await using var api = await ApiFactory.StartAsync();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 61; i++)
        {
            statuses.Add((await LoginAsync(api, $"guess{i}", "x")).StatusCode);
        }

        Assert.Equal(60, statuses.Count(s => s == HttpStatusCode.Forbidden));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);
    }

    [Fact]
    [Trait("AC", "AUTH-13")]
    public async Task Refresh_HasItsOwnBudget()
    {
        await using var api = await ApiFactory.StartAsync();
        var session = await LoginAsync(api, "sara").ExpectOkAsync();

        for (var i = 0; i < 59; i++)
        {
            await LoginAsync(api, $"guess{i}", "x");
        }

        var refreshed = await api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = session["refreshToken"]!.GetValue<string>() });
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
    }
}
