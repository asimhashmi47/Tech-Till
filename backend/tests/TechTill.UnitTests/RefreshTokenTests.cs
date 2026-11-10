using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Features.Auth;

namespace TechTill.UnitTests;

/// <summary>Refresh tokens were stored as issued and a replayed one went unnoticed (F11).</summary>
public class RefreshTokenTests
{
    private static async Task<AuthResult> SignInAsync(TestApp app)
    {
        app.AsNobody();
        return await app.Auth.LoginAsync(new LoginRequest("staff", TestApp.Password));
    }

    [Fact]
    [Trait("AC", "AUTH-15")]
    public async Task TheDatabase_HoldsOnlyAHashOfTheToken()
    {
        using var app = new TestApp();
        var session = await SignInAsync(app);

        var stored = await app.Saved().RefreshTokens.Select(t => t.Token).ToListAsync();

        Assert.DoesNotContain(session.RefreshToken, stored);
        Assert.Contains(RefreshTokenHash.Of(session.RefreshToken), stored);
    }

    [Fact]
    [Trait("AC", "AUTH-15")]
    public async Task ReplayingARotatedToken_EndsTheWholeFamily()
    {
        using var app = new TestApp();
        var first = await SignInAsync(app);
        var second = await app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken));

        app.Clock.UtcNow = app.Clock.UtcNow.AddMinutes(2);
        await Assert.ThrowsAsync<ForbiddenException>(() => app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken)));

        await Assert.ThrowsAsync<ForbiddenException>(() => app.Auth.RefreshAsync(new RefreshRequest(second.RefreshToken)));
        Assert.True(app.Saved().Users.Single(u => u.Id == app.StaffId).TokenVersion > 0);
    }

    [Fact]
    [Trait("AC", "AUTH-15")]
    public async Task TwoTabsRefreshingAtOnce_DoNotEndTheSession()
    {
        using var app = new TestApp();
        var first = await SignInAsync(app);
        var second = await app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken));

        await Assert.ThrowsAsync<ForbiddenException>(() => app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken)));

        var third = await app.Auth.RefreshAsync(new RefreshRequest(second.RefreshToken));
        Assert.NotNull(third.AccessToken);
    }
}
