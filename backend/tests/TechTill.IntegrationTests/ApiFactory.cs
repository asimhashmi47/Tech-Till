using System.Data.Common;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using TechTill.Api.Security;
using TechTill.Infrastructure.Persistence;

namespace TechTill.IntegrationTests;

/// <summary>Throws from inside a chosen SQL statement, to prove a transaction rolls back.</summary>
public sealed class FaultInjector : DbCommandInterceptor
{
    public string? FailWhenSqlContains { get; set; }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Check(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Check(command);
        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void Check(DbCommand command)
    {
        if (FailWhenSqlContains is { } text && command.CommandText.Contains(text, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Injected database failure");
        }
    }
}

/// <summary>
/// The real API over HTTP, on a disposable SQLite file. Migrations and the seed run once, and
/// each factory starts from a copy, so a test can never touch a developer's techtill.db.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<CurrentUser>
{
    public const string Secret = "integration-test-signing-key-at-least-32-chars";
    public const string Password = "TechTill#2026";

    private static readonly string Folder = Path.Combine(Path.GetTempPath(), "techtill-tests-" + Environment.ProcessId);
    private static readonly SemaphoreSlim TemplateLock = new(1, 1);
    private static string? _template;

    private readonly string _database;
    private readonly string _environment;
    private readonly Dictionary<string, string> _tokens = [];
    private bool _keepDatabase;

    public FaultInjector Fault { get; } = new();

    private readonly Dictionary<string, string> _settings;
    private Action<IServiceCollection>? _extraServices;

    private ApiFactory(string database, string environment, Dictionary<string, string>? settings = null)
    {
        _database = database;
        _environment = environment;
        _settings = settings ?? [];
    }

    /// <summary>A brand new install: no template copy, so first-run behaviour is what runs.</summary>
    public static Task<ApiFactory> StartEmptyAsync(string environment, Dictionary<string, string>? settings = null)
    {
        Directory.CreateDirectory(Folder);
        var factory = new ApiFactory(Path.Combine(Folder, Guid.NewGuid().ToString("N") + ".db"), environment, settings);

        try
        {
            _ = factory.Services;
        }
        catch
        {
            factory.Dispose();
            throw;
        }

        return Task.FromResult(factory);
    }

    public static async Task<ApiFactory> StartAsync(
        string environment = "Testing",
        Dictionary<string, string>? settings = null,
        Action<IServiceCollection>? services = null)
    {
        Directory.CreateDirectory(Folder);
        await TemplateLock.WaitAsync();

        try
        {
            if (_template is null)
            {
                var path = Path.Combine(Folder, "template.db");
                var seed = new ApiFactory(path, "Development") { _keepDatabase = true };
                _ = seed.Services;
                await seed.DisposeAsync();
                SqliteConnection.ClearAllPools();
                _template = path;
            }
        }
        finally
        {
            TemplateLock.Release();
        }

        var copy = Path.Combine(Folder, Guid.NewGuid().ToString("N") + ".db");
        File.Copy(_template, copy);
        var factory = new ApiFactory(copy, environment, settings) { _extraServices = services };
        _ = factory.Services;
        return factory;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_database}");
        builder.UseSetting("Jwt:Secret", Secret);
        builder.UseSetting("Serilog:WriteTo:0:Args:path", Path.Combine(Folder, "log-.txt"));
        // Suites share one account across hundreds of calls a minute. UserRateLimitTests puts
        // the production limits back to prove them.
        builder.UseSetting("RateLimits:RequestsPerUserPerMinute", "1000000");
        builder.UseSetting("RateLimits:ExportsPerUserPerMinute", "1000000");

        foreach (var (key, value) in _settings)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureTestServices(services =>
        {
            services.ConfigureDbContext<AppDbContext>(options => options.AddInterceptors(Fault));
            _extraServices?.Invoke(services);
        });
    }

    public HttpClient Anonymous() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    public async Task<HttpClient> AsAsync(string username)
    {
        if (!_tokens.TryGetValue(username, out var token))
        {
            var response = await Anonymous().PostAsJsonAsync("/api/auth/login", new { username, password = Password });
            response.EnsureSuccessStatusCode();
            token = (await response.Content.ReadFromJsonAsync<JsonObject>())!["accessToken"]!.GetValue<string>();
            _tokens[username] = token;
        }

        return WithToken(token);
    }

    public HttpClient WithToken(string token)
    {
        var client = Anonymous();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public async Task<T> DbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        await using var scope = Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();

        if (_keepDatabase)
        {
            return;
        }

        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            try
            {
                File.Delete(_database + suffix);
            }
            catch (IOException)
            {
                // The operating system cleans the temp folder; a locked file fails no test.
            }
        }
    }
}

/// <summary>One seeded API shared by tests that only add their own records.</summary>
public sealed class SharedApi : IAsyncLifetime
{
    public ApiFactory Api { get; private set; } = null!;

    public async Task InitializeAsync() => Api = await ApiFactory.StartAsync();

    public async Task DisposeAsync() => await Api.DisposeAsync();
}

[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<SharedApi>;

public static class Http
{
    public static async Task<JsonObject> JsonAsync(this HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonObject>())!;

    public static async Task<JsonObject> ExpectOkAsync(this Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.JsonAsync();
    }

    public static long Id(this JsonObject node) => node["id"]!.GetValue<long>();

    public static decimal Dec(this JsonNode? node) => node!.GetValue<decimal>();
}
