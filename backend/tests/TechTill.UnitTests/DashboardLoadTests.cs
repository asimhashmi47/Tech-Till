using TechTill.Application.Features.Users;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>
/// Under load the dashboard took the API down from 5 users up: every user built their own copy
/// and every concurrent miss built it again (load test, Phase 7).
/// </summary>
public class DashboardLoadTests
{
    [Fact]
    [Trait("AC", "PERF-01")]
    public async Task UsersWithTheSameShops_ShareOneDashboard()
    {
        using var app = new TestApp();
        var second = await app.Users.CreateAsync(new SaveUserRequest("owner2", "Second Owner", UserRole.Admin, true, "second-owner-pass", [], []));
        var first = await app.Dashboard.GetAsync(null, null, null);

        // Written straight to the database, so no cache invalidation runs.
        app.AddInvoice(app.AcmeId, TestApp.Now, 500m);
        app.User.UserId = second.Id;
        app.User.Username = "owner2";

        var shared = await app.Dashboard.GetAsync(null, null, null);

        Assert.Equal(first.Kpi.PeriodSales, shared.Kpi.PeriodSales);
    }

    [Fact]
    [Trait("AC", "PERF-01")]
    public async Task ConcurrentMisses_BuildOnce()
    {
        using var app = new TestApp();
        var calls = 0;
        var gate = new TaskCompletionSource();

        async Task<int> Build()
        {
            Interlocked.Increment(ref calls);
            await gate.Task;
            return 42;
        }

        var waiting = Enumerable.Range(0, 20).Select(_ => app.Cache.GetOrCreateAsync("dashboard:x", Build)).ToList();
        gate.SetResult();
        var results = await Task.WhenAll(waiting);

        Assert.Equal(1, calls);
        Assert.All(results, r => Assert.Equal(42, r));
    }

    [Fact]
    [Trait("AC", "PERF-01")]
    public async Task AFailedBuild_IsNotCached()
    {
        using var app = new TestApp();
        var calls = 0;

        Task<int> Build() => ++calls == 1 ? throw new InvalidOperationException("first") : Task.FromResult(7);

        await Assert.ThrowsAsync<InvalidOperationException>(() => app.Cache.GetOrCreateAsync("dashboard:y", Build));
        Assert.Equal(7, await app.Cache.GetOrCreateAsync("dashboard:y", Build));
    }
}
