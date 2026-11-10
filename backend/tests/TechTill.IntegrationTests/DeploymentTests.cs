using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TechTill.Domain.Enums;

namespace TechTill.IntegrationTests;

/// <summary>
/// Behind a reverse proxy every client looked like the proxy, so audit IPs were wrong and the
/// per-address sign-in limit was shared by everyone; nothing could force HTTPS either (F25).
/// </summary>
public class DeploymentTests
{
    private const string Proxy = "10.0.0.5";
    private const string Client = "203.0.113.9";

    /// <summary>TestServer has no socket, so this puts the proxy's address on the connection.</summary>
    private sealed class FromProxy : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = IPAddress.Parse(Proxy);
                return nextMiddleware(context);
            });
            next(app);
        };
    }

    private static async Task<string?> AuditedIpAsync(Dictionary<string, string> settings)
    {
        await using var api = await ApiFactory.StartAsync("Testing", settings, s => s.AddSingleton<IStartupFilter, FromProxy>());
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login") { Content = JsonContent.Create(new { username = "sara", password = "wrong-one" }) };
        request.Headers.Add("X-Forwarded-For", Client);
        await api.Anonymous().SendAsync(request);

        return await api.DbAsync(db => db.AuditLogs
            .Where(a => a.Action == AuditAction.LoginFailed)
            .OrderByDescending(a => a.Id)
            .Select(a => a.Ip)
            .FirstAsync());
    }

    [Fact]
    [Trait("AC", "API-10")]
    public async Task ATrustedProxy_PassesOnTheClientAddress()
        => Assert.Equal(Client, await AuditedIpAsync(new() { ["ReverseProxy:KnownProxies:0"] = Proxy }));

    [Fact]
    [Trait("AC", "API-10")]
    public async Task AnUntrustedSender_CannotChooseItsOwnAddress()
        => Assert.Equal(Proxy, await AuditedIpAsync([]));

    [Fact]
    [Trait("AC", "API-10")]
    public async Task HttpsRedirection_CanBeSwitchedOn()
    {
        await using var api = await ApiFactory.StartAsync("Production", new() { ["Https:RedirectHttp"] = "true", ["https_port"] = "443" });

        var response = await api.Anonymous().GetAsync("/health");

        Assert.Equal(HttpStatusCode.TemporaryRedirect, response.StatusCode);
        Assert.Equal("https", response.Headers.Location!.Scheme);
    }
}
